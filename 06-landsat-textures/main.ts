import { Pane } from "tweakpane";
import * as EssentialsPlugins from "@tweakpane/plugin-essentials";
import { renderOnResizeObserver } from "../utils/renderOnResizeObserver";
import { createDefaultRenderPass } from "../utils/renderPass";
import { initWebGPU } from "../utils/webgpuSetup";
import { loadData } from "./loadData";
import shaderCode from "./shader.wgsl?raw";

enum DrawMode {
    SINGLE_BAND = 0,
    MULTI_BAND = 1,
    SPECTRAL_INDEX = 2,
}

enum Colormap {
    GREY = 0,
    VIRIDIS = 1,
    INFERNO = 2,
    PLASMA = 3,
    MAGMA = 4,
}

enum SpectralIndex {
    NDVI = 0,
    NDWI = 1,
}

async function main() {
    // ---- Init WebGPU ----

    const { device, context, canvas, format } = await initWebGPU();

    const module = device.createShaderModule({
        code: shaderCode,
    });

    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format }],
        },
    });

    // ---- Load Data ----
    const data = await loadData();

    // ---- Settings ----

    const settings = {
        drawMode: DrawMode.SINGLE_BAND,

        // Single Band
        singleChannel: 0,
        colormap: Colormap.INFERNO,

        // Multi Band
        redChannel: 2,
        greenChannel: 1,
        blueChannel: 0,

        // Spectral Index
        spectralIndex: SpectralIndex.NDVI,
    };

    const pane = new Pane();
    pane.registerPlugin(EssentialsPlugins);
    pane.addBinding(settings, "drawMode", {
        options: {
            "Single Band": DrawMode.SINGLE_BAND,
            "Multi Band": DrawMode.MULTI_BAND,
            "Spectral Index": DrawMode.SPECTRAL_INDEX,
        },
    });

    const indexOptions = Object.fromEntries(
        data.bands.map((b, i) => <[string, number]>[b.label ?? `Band ${i}`, i]),
    );

    const singleFolder = pane.addFolder({ title: "Single Band" });
    singleFolder.addBinding(settings, "singleChannel", {
        options: indexOptions,
        label: "Channel",
    });
    singleFolder.addBinding(settings, "colormap", {
        options: {
            Grey: Colormap.GREY,
            Viridis: Colormap.VIRIDIS,
            Inferno: Colormap.INFERNO,
            Plasma: Colormap.PLASMA,
            Magma: Colormap.MAGMA,
        },
    });

    const multiFolder = pane.addFolder({ title: "Multi Band" });
    multiFolder.addBinding(settings, "redChannel", {
        options: indexOptions,
        label: "Red channel",
    });
    multiFolder.addBinding(settings, "greenChannel", {
        options: indexOptions,
        label: "Green channel",
    });
    multiFolder.addBinding(settings, "blueChannel", {
        options: indexOptions,
        label: "Blue channel",
    });

    const spectralIndexFolder = pane.addFolder({ title: "Spectral Index" });
    spectralIndexFolder.addBinding(settings, "spectralIndex", {
        options: {
            NDVI: SpectralIndex.NDVI,
            NDWI: SpectralIndex.NDWI,
        },
    });

    function showHideFolders() {
        singleFolder.hidden = settings.drawMode !== 0;
        multiFolder.hidden = settings.drawMode !== 1;
        spectralIndexFolder.hidden = settings.drawMode !== 2;
    }

    showHideFolders();

    // ---- Textures ----
    const samples = data.bands.length;
    const width = data.width;
    const height = data.height;
    console.log(data);

    const texture = device.createTexture({
        size: [width, height, samples],
        format: "r16sint",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    data.bands.forEach((band, i) => {
        device.queue.writeTexture(
            { texture, origin: { z: i } },
            band.values,
            { bytesPerRow: width * 2 },
            {
                width,
                height,
                depthOrArrayLayers: 1,
            },
        );
    });

    // ---- Uniforms ----

    // ---- Image Uniforms ----
    const imageUniformsBufferSize = 2 * 4; // size: 2 * u32
    const imageUniformsBuffer = device.createBuffer({
        label: "Image Uniforms Buffer",
        size: imageUniformsBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const imageUniformsBufferValues = new Uint32Array(
        imageUniformsBufferSize / 4,
    );
    imageUniformsBufferValues.set([width, height], 0);
    device.queue.writeBuffer(imageUniformsBuffer, 0, imageUniformsBufferValues);

    // ---- Display Uniforms ----
    // Display Uniforms
    const displayUniformBufferSize =
        4 * 4 + // band_index,  spectralIndex   : 3 * u32 + 1 * i32
        4 * 4 + // min_val,     draw_mode       : 3 * i32 + 1 * i32
        4 * 4; //  max_val      colormap        : 3 * i32 + 1 * i32
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
    const bandIndexOffset = 0;
    const spectralIndexOffset = 3;
    const minValOffset = 4;
    const drawModeOffset = 7;
    const maxValOffset = 8;
    const colormapOffset = 11;

    function updateDisplayUniforms() {
        displayUniformBufferValuesI32.set([settings.drawMode], drawModeOffset);

        if (settings.drawMode === DrawMode.SINGLE_BAND) {
            const ndx = settings.singleChannel;
            const minVal = data.bands[ndx].min;
            const maxVal = data.bands[ndx].max;

            displayUniformBufferValuesU32.set([ndx], bandIndexOffset);
            displayUniformBufferValuesI32.set([minVal], minValOffset);
            displayUniformBufferValuesI32.set([maxVal], maxValOffset);
            displayUniformBufferValuesI32.set(
                [settings.colormap],
                colormapOffset,
            );
        } else if (settings.drawMode === DrawMode.MULTI_BAND) {
            const rNdx = settings.redChannel;
            const { min: rMin, max: rMax } = data.bands[rNdx];
            const gNdx = settings.greenChannel;
            const { min: gMin, max: gMax } = data.bands[gNdx];
            const bNdx = settings.blueChannel;
            const { min: bMin, max: bMax } = data.bands[bNdx];

            displayUniformBufferValuesU32.set(
                [rNdx, gNdx, bNdx],
                bandIndexOffset,
            );
            displayUniformBufferValuesI32.set([rMin, gMin, bMin], minValOffset);
            displayUniformBufferValuesI32.set([rMax, gMax, bMax], maxValOffset);
        } else if (settings.drawMode === DrawMode.SPECTRAL_INDEX) {
            displayUniformBufferValuesI32.set(
                [settings.spectralIndex],
                spectralIndexOffset,
            );
        }

        device.queue.writeBuffer(
            displayUniformBuffer,
            0,
            displayUniformBufferValues,
        );
    }

    updateDisplayUniforms();

    // ---- Create Bind Group ----

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: imageUniformsBuffer } },
            { binding: 1, resource: { buffer: displayUniformBuffer } },
            {
                binding: 2,
                resource: texture.createView({ dimension: "2d-array" }),
            },
        ],
    });

    // ---- Render ----

    function render() {
        const { encoder, pass } = createDefaultRenderPass(
            device,
            context,
            pipeline,
        );

        pass.setBindGroup(0, bindGroup);

        pass.draw(6);
        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }

    renderOnResizeObserver(canvas, render);

    pane.on("change", () => {
        showHideFolders();
        updateDisplayUniforms();
        render();
    });
}

main();
