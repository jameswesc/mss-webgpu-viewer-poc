import { renderOnResizeObserver } from "../utils/renderOnResizeObserver";
import { initWebGPU } from "../utils/webgpuSetup";
import shaderCode from "./shader.wgsl?raw";
import { Pane } from "tweakpane";
import * as EssentialsPlugins from "@tweakpane/plugin-essentials";

const WIDTH = 24;
const HEIGHT = 24;
const SAMPLES = 7;

function generateRandomData(width: number, height: number, samples: number) {
    const pixels = width * height;
    const data = new Int32Array(pixels * samples);

    for (let p = 0; p < pixels; p++) {
        const offset = p * samples;

        const values = new Array(samples)
            .fill(0)
            .map((_) => Math.floor(Math.random() * 10_000));

        data.set(values, offset);
    }

    return data;
}

const settings = {
    redIndex: 0,
    redDomain: {
        min: 0,
        max: 10000,
    },
    greenIndex: 1,
    greenDomain: {
        min: 0,
        max: 10000,
    },
    blueIndex: 2,
    blueDomain: {
        min: 0,
        max: 10000,
    },
};

type Settings = typeof settings;

async function main() {
    const pane = new Pane();
    pane.registerPlugin(EssentialsPlugins);

    const settings = {
        redIndex: 0,
        redDomain: {
            min: 0,
            max: 10000,
        },
        greenIndex: 1,
        greenDomain: {
            min: 0,
            max: 10000,
        },
        blueIndex: 2,
        blueDomain: {
            min: 0,
            max: 10000,
        },
    };

    const redFolder = pane.addFolder({
        title: "Red Channel",
    });
    const blueFolder = pane.addFolder({
        title: "Blue Channel",
    });
    const greenFolder = pane.addFolder({
        title: "Green Channel",
    });
    redFolder.addBinding(settings, "redIndex", {
        min: 0,
        max: SAMPLES - 1,
        step: 1,
    });
    redFolder.addBinding(settings, "redDomain", {
        min: 0,
        max: 10_000,
        step: 100,
    });
    greenFolder.addBinding(settings, "greenIndex", {
        min: 0,
        max: SAMPLES - 1,
        step: 1,
    });
    greenFolder.addBinding(settings, "greenDomain", {
        min: 0,
        max: 10_000,
        step: 100,
    });
    blueFolder.addBinding(settings, "blueIndex", {
        min: 0,
        max: SAMPLES - 1,
        step: 1,
    });
    blueFolder.addBinding(settings, "blueDomain", {
        min: 0,
        max: 10_000,
        step: 100,
    });

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
    imageUniformsBufferValues.set([WIDTH, HEIGHT, SAMPLES], 0);
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
            [settings.redIndex, settings.blueIndex, settings.greenIndex],
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

    const pixels = WIDTH * HEIGHT;

    const storageBufferUnitSize = 4; // (f32)
    const storageBufferSize = pixels * SAMPLES * storageBufferUnitSize;
    const storageBuffer = device.createBuffer({
        label: "Storage Buffer",
        size: storageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const storageBufferValues = generateRandomData(WIDTH, HEIGHT, SAMPLES);
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
