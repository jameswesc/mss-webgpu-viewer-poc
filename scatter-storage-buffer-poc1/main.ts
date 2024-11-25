import { renderOnResizeObserver } from "../utils/renderOnResizeObserver";
import { initWebGPU } from "../utils/webgpuSetup";
import { loadDataFromURL } from "./loadData";
import { Pane } from "tweakpane";
import * as EssentialsPlugins from "@tweakpane/plugin-essentials";
import shaderCode from "./shader.wgsl?raw";

type PlotSettings = {
    x_ndx: number;
    y_ndx: number;
    x_domain: {
        min: number;
        max: number;
    };
    y_domain: {
        min: number;
        max: number;
    };
    size: number;
};

async function main() {
    const settings: PlotSettings = {
        x_ndx: 0,
        y_ndx: 1,
        x_domain: {
            min: 0,
            max: 10_000,
        },
        y_domain: {
            min: 0,
            max: 10_000,
        },
        size: 1,
    };

    const pane = new Pane();
    pane.registerPlugin(EssentialsPlugins);

    const ndx_options = {
        blue: 0,
        green: 1,
        red: 2,
        nir: 3,
        swir1: 4,
        swir2: 5,
        oa_fmask: 6,
    };

    pane.addBinding(settings, "x_ndx", {
        options: ndx_options,
        label: "X axis",
    });
    pane.addBinding(settings, "y_ndx", {
        options: ndx_options,
        label: "Y axis",
    });
    pane.addBinding(settings, "x_domain", {
        min: 0,
        max: 10_000,
        step: 100,
    });
    pane.addBinding(settings, "y_domain", {
        min: 0,
        max: 10_000,
        step: 100,
    });
    pane.addBinding(settings, "size");

    // Fetch image data
    const image_data = await loadDataFromURL();
    const samples = image_data.length;
    const pixels = image_data[0].length;

    // Setup
    const { device, canvas, context, format } = await initWebGPU();

    const module = device.createShaderModule({
        label: "Scatter PoC - Shader Module",
        code: shaderCode,
    });

    const pipeline = device.createRenderPipeline({
        label: "Scatter PoC - Pipeline",
        layout: "auto",
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format }],
        },
    });

    // Uniforms
    //
    // Uniforms - Size
    const sizeUniformsBufferSize = 2 * 4; // resolution (2 x f32)
    const sizeUniformsBuffer = device.createBuffer({
        label: "SizeUniforms Buffer",
        size: sizeUniformsBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sizeUniformsBufferValues = new Float32Array(2);

    function updateSizeUniforms() {
        // Update size uniforms
        sizeUniformsBufferValues.set([canvas.width, canvas.height], 0);
        device.queue.writeBuffer(
            sizeUniformsBuffer,
            0,
            sizeUniformsBufferValues,
        );
    }
    updateSizeUniforms();

    // Uniforms - Plot
    const plotUniformsBufferSize =
        2 * 4 + //  val_ndx     (2 x u32)
        2 * 4 + //  x_domain    (2 x i32)
        2 * 4 + //  y_domain    (2 x i32)
        1 * 4 + //  size        (1 x f32)
        1 * 4; //   stride      (1 x u32)

    const plotUniformsBuffer = device.createBuffer({
        label: "PlotUniforms Buffer",
        size: plotUniformsBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const plotUniformsBufferValuesU32 = new Uint32Array(
        plotUniformsBufferSize / 4,
    );
    const plotUniformsBufferValuesI32 = new Int32Array(
        plotUniformsBufferValuesU32.buffer,
    );
    const plotUniformsBufferValuesF32 = new Float32Array(
        plotUniformsBufferValuesU32.buffer,
    );
    const plotUniformsOffsets = {
        val_ndx: 0,
        x_domain: 2,
        y_domain: 4,
        size: 6,
        samples: 7,
    };
    plotUniformsBufferValuesU32.set([samples], plotUniformsOffsets.samples);

    function updatePlotUniforms() {
        plotUniformsBufferValuesU32.set(
            [settings.x_ndx, settings.y_ndx],
            plotUniformsOffsets.val_ndx,
        );
        plotUniformsBufferValuesI32.set(
            [settings.x_domain.min, settings.x_domain.max],
            plotUniformsOffsets.x_domain,
        );
        plotUniformsBufferValuesI32.set(
            [settings.y_domain.min, settings.y_domain.max],
            plotUniformsOffsets.y_domain,
        );
        plotUniformsBufferValuesF32.set(
            [settings.size],
            plotUniformsOffsets.size,
        );

        device.queue.writeBuffer(
            plotUniformsBuffer,
            0,
            plotUniformsBufferValuesU32,
        );
    }

    updatePlotUniforms();
    // Storage Buffer

    const valuesStorageBufferSize = pixels * samples * 4; // i32 for each sample
    const valuesStorageBufferValues = new Int32Array(
        valuesStorageBufferSize / 4,
    );

    for (let i = 0; i < pixels; i++) {
        for (let j = 0; j < samples; j++) {
            valuesStorageBufferValues[i * samples + j] = image_data[j][i];
        }
    }

    const valuesStorageBuffer = device.createBuffer({
        label: "Values Storage Buffer",
        size: valuesStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(valuesStorageBuffer, 0, valuesStorageBufferValues);

    // Bind Groups

    const uniformBindGroup = device.createBindGroup({
        label: "Uniforms Bind Group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: sizeUniformsBuffer } },
            { binding: 1, resource: { buffer: plotUniformsBuffer } },
        ],
    });

    const storageBindGroup = device.createBindGroup({
        label: "Storage Bind Group",
        layout: pipeline.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: { buffer: valuesStorageBuffer } }],
    });

    function render() {
        const encoder = device.createCommandEncoder();
        const view = context.getCurrentTexture().createView();
        const colorAttachment: GPURenderPassColorAttachment = {
            view,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
        };
        const pass = encoder.beginRenderPass({
            label: "Render pass",
            colorAttachments: [colorAttachment],
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, uniformBindGroup);
        pass.setBindGroup(1, storageBindGroup);

        // Draw a quad per pixel
        pass.draw(6, pixels);
        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }

    renderOnResizeObserver(canvas, () => {
        updateSizeUniforms();
        render();
    });
    pane.on("change", () => {
        updatePlotUniforms();
        render();
    });
}

main();
