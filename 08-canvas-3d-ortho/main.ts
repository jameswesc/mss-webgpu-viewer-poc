import { canvasResizeObserver } from "../utils/canvasResizeObserver";
import {
    getAdapter,
    getCanvas,
    getContext,
    getDevice,
} from "../utils/webgpuSetup";
import { loadData, ImageData } from "./loadData";
import { createState } from "./state";
import shaderCode from "./shader.wgsl?raw";
import { mat4 } from "wgpu-matrix";
import { mapControls } from "./mapControls";

type AppState = {
    // Canvas Info
    canvasWidth: number;
    canvasHeight: number;
    canvasClientWidth: number;
    canvasClientHeight: number;

    // Map Control (view) Info
    zoom: number;
    position: number[];

    // ImageData
    imageData: ImageData;
};

async function main() {
    const imageData = await loadData();

    // State Management
    const state = createState<AppState>({
        canvasWidth: 0,
        canvasHeight: 0,
        canvasClientWidth: 0,
        canvasClientHeight: 0,

        zoom: 0,
        position: [0, 0],

        imageData: imageData,
    });

    // Canvas Management
    const canvas = getCanvas();
    canvasResizeObserver(canvas, (canvasSize) => {
        state.updateState((state) => {
            state.canvasWidth = canvasSize.width;
            state.canvasHeight = canvasSize.height;
            state.canvasClientWidth = canvasSize.clientWidth;
            state.canvasClientHeight = canvasSize.clientHeight;
        });
    });

    // Map Controls
    mapControls({
        element: canvas,
        onPanDelta(dx, dy) {
            state.updateState((s) => {
                s.position[0] += dx;
                s.position[1] += dy;
            });
        },
        onZoomDelta(dz) {
            state.updateState((s) => {
                s.zoom += dz;
            });
        },
    });

    // Renderer
    const { render } = await mssRenderer(canvas, state.getState());

    // Render on state change
    state.subscribe(render);
}

// For the first one I will assume always only 1 canvas
export async function mssRenderer(
    htmlCanvas: HTMLCanvasElement,
    state: AppState,
) {
    // ---- Generic ----

    // ---- Devices ----
    // freq : Do once for everywhere
    // need : nothing
    const adapter = await getAdapter();
    const device = await getDevice(adapter);

    // ---- Canvas & Context ----
    // freq : Once per canvas
    // need : canvas, device
    const canvas = htmlCanvas;
    const context = getContext(canvas);
    const preferredCanvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: preferredCanvasFormat,
    });

    // ---- Not Generic ----

    // ---- Shader Module ----
    // freq : Once (ideally) per thing*
    // need : shaderCode,
    //
    // *not entierly sure what thing is. e.g. can reuse shader code for all texture quads
    // could use for all standard mesh(geometry, material) combos
    const module = device.createShaderModule({
        code: shaderCode,
    });

    // ---- Render Pipeline ----
    // freq : Once (ideally) per thing*
    // need : module, context(canvas)
    //
    // Kind of same frequency and needs as module
    // Note, can be configured with buffers and stuff
    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format: preferredCanvasFormat }],
        },
    });

    // ---- Generic-ish ----
    // Can be made to be same or similar amongst different things

    // ---- Uniform ----
    const UNIFORM_BIND_GROUP_INDEX = 0;

    // GPU Uniform Buffer
    // freq : Up to us
    // need : shader (indirect)
    const uniformBufferSize = 4 * 4 * 4; // view_proj_mat: mat4x4<f32>
    const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // CPU Array Buffer
    // freq : Up to us
    // need : gpuBuffer (indirect)
    const uniformData = new ArrayBuffer(uniformBufferSize);

    // CPU View Into Array Buffer
    // freq : Up to us
    // need : gpuBuffer (indirect)
    const viewProjMatValues = new Float32Array(uniformData, 0, 4 * 4);
    mat4.identity(viewProjMatValues);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    // ---- Texture Data ----
    const imageData = state.imageData;
    const samples = imageData.bands.length;
    const width = imageData.width;
    const height = imageData.height;

    const texture = device.createTexture({
        size: [width, height, samples],
        format: "r16sint",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // GPU Bind Group
    // freq : Once per pipeline
    // need : pipeline, sahader (inderict)
    const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(UNIFORM_BIND_GROUP_INDEX),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: texture.createView() },
        ],
    });

    imageData.bands.forEach((band, i) => {
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

    // ---- Instance Data ----
    const INSTANCE_BIND_GROUP_INDEX = 1;

    const numInstances = 5;
    const instanceStorageBufferUnitSize = 4 * 4 * 4; // model_mat: mat4x4<f32>
    const instanceStorageBufferSize =
        numInstances * instanceStorageBufferUnitSize;
    const instanceStorageBuffer = device.createBuffer({
        size: instanceStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const instanceData = new ArrayBuffer(instanceStorageBufferSize);
    const instanceDataF32View = new Float32Array(instanceData);

    // Initialise instance data with identity matrices
    for (let i = 0; i < numInstances; i++) {
        mat4.identity(instanceDataF32View.subarray(i * 16, i * 16 + 16));
    }

    device.queue.writeBuffer(instanceStorageBuffer, 0, instanceData);

    // ---- Instance Data Bind Group ----
    const instanceDataBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(INSTANCE_BIND_GROUP_INDEX),
        entries: [{ binding: 0, resource: { buffer: instanceStorageBuffer } }],
    });

    // ---- Render Function ----

    function render(state: AppState) {
        // Canvas size might be 0 if we try to render before resize observer
        // has been ran yet.
        if (state.canvasClientWidth == 0 || state.canvasClientHeight == 0) {
            return;
        }

        if (state.imageData == null) {
            return;
        }

        // ---- ViewProject Matrix ---
        // Project Matrix
        // These need to happen
        // But they may not have changed
        // State could have been triggered by something else
        canvas.width = state.canvasWidth;
        canvas.height = state.canvasHeight;
        mat4.ortho(
            0,
            state.canvasClientWidth,
            state.canvasClientHeight,
            0,
            200,
            -200,
            viewProjMatValues,
        );

        // View Matrix -- this shouldn't happen here
        const tx = state.position[0];
        const ty = state.position[1];
        // effective zoom
        const s = Math.pow(Math.E, state.zoom);
        mat4.translate(viewProjMatValues, [tx, ty, 0], viewProjMatValues);
        mat4.scale(viewProjMatValues, [s, s, 1], viewProjMatValues);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        // Instance Matrices -- this shouldn't happen here
        const imWidth = state.imageData!.width;
        const imHeight = state.imageData!.height;

        // Instance Data Matrices
        for (let i = 0; i < numInstances; i++) {
            const modelMat = mat4.identity();
            mat4.translate(
                modelMat,
                [
                    20 + 0.5 * imWidth,
                    20 + 0.5 * imHeight + i * (imHeight + 20),
                    0,
                    0,
                ],
                modelMat,
            );
            mat4.scale(modelMat, [imWidth, imHeight, 1], modelMat);
            instanceDataF32View.set(modelMat, i * 16);
        }
        device.queue.writeBuffer(instanceStorageBuffer, 0, instanceData);

        // ---- Render Pass Start ----
        // freq : once per render
        // need : device, context
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

        // ---- Render Pass Pipeline ----
        // freq : per render, per pipeline (thing*)
        // need : pass, things*
        pass.setPipeline(pipeline);
        pass.setBindGroup(UNIFORM_BIND_GROUP_INDEX, uniformBindGroup);
        pass.setBindGroup(INSTANCE_BIND_GROUP_INDEX, instanceDataBindGroup);
        pass.draw(6, numInstances);

        // ---- Render Pass End ----
        // freq : per render
        // need : pass
        pass.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }

    return {
        render,
    };
}

main();
