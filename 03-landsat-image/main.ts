import { renderOnResizeObserver } from "../utils/renderOnResizeObserver";
import { initWebGPU } from "../utils/webgpuSetup";
import shaderCode from "./shader.wgsl?raw";
import { Pane } from "tweakpane";
import * as EssentialsPlugins from "@tweakpane/plugin-essentials";
import { loadDataFromURL } from "./loadData";

const settings = {
    redIndex: 2,
    redDomain: {
        min: 174,
        max: 2529,
    },
    greenIndex: 1,
    greenDomain: {
        min: 312,
        max: 2413,
    },
    blueIndex: 0,
    blueDomain: {
        min: 254,
        max: 2038,
    },
};

const ndxOptions = {
    blue: 0,
    green: 1,
    red: 2,
    nir: 3,
    swir1: 4,
    swir2: 5,
    oa_fmask: 6,
};

type Settings = typeof settings;

async function main() {
    // ---- Data Fetching ----

    const data = await loadDataFromURL();
    const { width, height } = data;
    const samples = data.length;

    // ---- Data Sorting ----
    // Only used to get min max values

    const t0 = performance.now();
    const minMaxValues: [number, number][] = [];
    for (let s = 0; s < samples; s++) {
        const valuesCopy = data[s].slice();
        valuesCopy.sort();
        minMaxValues.push([valuesCopy[0], valuesCopy[valuesCopy.length - 1]]);
    }
    const t1 = performance.now();
    console.log(`Data sorted in ${t1 - t0} ms`);

    // ---- Tweakpane ----

    const pane = new Pane();
    pane.registerPlugin(EssentialsPlugins);

    const redFolder = pane.addFolder({
        title: "Red Channel",
    });
    redFolder.addBinding(settings, "redIndex", {
        options: ndxOptions,
    });
    redFolder.addBinding(settings, "redDomain", {
        min: 0,
        max: 10_000,
        step: 1,
    });

    const greenFolder = pane.addFolder({
        title: "Green Channel",
    });
    greenFolder.addBinding(settings, "greenIndex", {
        options: ndxOptions,
    });
    greenFolder.addBinding(settings, "greenDomain", {
        min: 0,
        max: 10_000,
        step: 1,
    });

    const blueFolder = pane.addFolder({
        title: "Blue Channel",
    });
    blueFolder.addBinding(settings, "blueIndex", {
        options: ndxOptions,
    });
    blueFolder.addBinding(settings, "blueDomain", {
        min: 0,
        max: 10_000,
        step: 1,
    });

    // ---- WebGPU ----

    const { device, canvas, context, format } = await initWebGPU();

    const module = device.createShaderModule({
        label: "Shader Module",
        code: shaderCode,
    });

    const pipeline = device.createRenderPipeline({
        label: "Render Pipeline",
        layout: "auto",
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format }],
        },
    });

    // ---- Uniforms ----
    // Image Uniforms
    const imageUniformsBufferSize =
        2 * 4 + //  size    : 2 * u32
        1 * 4 + //  samples : 1 * u32
        4; // padding
    const imageUniformsBuffer = device.createBuffer({
        label: "Image Uniforms Buffer",
        size: imageUniformsBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const imageUniformsBufferValues = new Uint32Array(
        imageUniformsBufferSize / 4,
    );
    imageUniformsBufferValues.set([width, height, samples], 0);
    device.queue.writeBuffer(imageUniformsBuffer, 0, imageUniformsBufferValues);

    // Display Uniforms
    const displayUniformBufferSize =
        4 * 4 + // sample_index : 3 * u32 + padding
        4 * 4 + // min_val      : 3 * i32 + padding
        4 * 4; //  max_val      : 3 * i32 + padding
    const displayUniformBuffer = device.createBuffer({
        label: "Display Uniforms Buffer",
        size: displayUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const displayUniformBufferValues = new ArrayBuffer(
        displayUniformBufferSize,
    );
    const displayUniformBufferValuesI32 = new Int32Array(
        displayUniformBufferValues,
    );
    const displayUniformBufferValuesU32 = new Uint32Array(
        displayUniformBufferValues,
    );
    const sampleIndexOffset = 0;
    const minValOffset = 4;
    const maxValOffset = 8;

    function updateDisplayUniformBufferValues(settings: Settings) {
        displayUniformBufferValuesU32.set(
            [settings.redIndex, settings.greenIndex, settings.blueIndex],
            sampleIndexOffset,
        );
        displayUniformBufferValuesI32.set(
            [
                settings.redDomain.min,
                settings.greenDomain.min,
                settings.blueDomain.min,
            ],
            minValOffset,
        );
        displayUniformBufferValuesI32.set(
            [
                settings.redDomain.max,
                settings.greenDomain.max,
                settings.blueDomain.max,
            ],
            maxValOffset,
        );
        device.queue.writeBuffer(
            displayUniformBuffer,
            0,
            displayUniformBufferValues,
        );
    }

    updateDisplayUniformBufferValues(settings);

    const uniformsBindGroup = device.createBindGroup({
        label: "Uniforms Bind Group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: imageUniformsBuffer } },
            { binding: 1, resource: { buffer: displayUniformBuffer } },
        ],
    });

    // ---- Storage Buffers ----

    const pixels = width * height;

    const storageBufferUnitSize = 4; // (f32)
    const storageBufferSize = pixels * samples * storageBufferUnitSize;
    const storageBuffer = device.createBuffer({
        label: "Storage Buffer",
        size: storageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const storageBufferValues = new Int32Array(storageBufferSize / 4);
    for (let i = 0; i < pixels; i++) {
        for (let s = 0; s < samples; s++) {
            let val = data[s][i];
            storageBufferValues[i * samples + s] = val;
        }
    }
    device.queue.writeBuffer(storageBuffer, 0, storageBufferValues);

    const storageBindGroup = device.createBindGroup({
        label: "Storage Buffers Bind Group",
        layout: pipeline.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: { buffer: storageBuffer } }],
    });

    function render() {
        const encoder = device.createCommandEncoder({
            label: "Default render pass encoder",
        });

        const view = context.getCurrentTexture().createView();
        const renderPassDescriptor: GPURenderPassDescriptor = {
            label: "Default render pass descriptor",
            colorAttachments: [
                {
                    view,
                    clearValue: { r: 0.3, g: 0.3, b: 0.3, a: 1 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        };

        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);

        pass.setBindGroup(0, uniformsBindGroup);
        pass.setBindGroup(1, storageBindGroup);

        pass.draw(6);
        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }

    renderOnResizeObserver(canvas, render);
    pane.on("change", () => {
        updateDisplayUniformBufferValues(settings);
        render();
    });
}

main();