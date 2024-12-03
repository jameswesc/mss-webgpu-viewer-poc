import { mat3 } from "wgpu-matrix";
import { canvasResizeObserver } from "../utils/canvasResizeObserver";
import {
    getAdapter,
    getCanvas,
    getContext,
    getDevice,
} from "../utils/webgpuSetup";
import shaderCode from "./shader.wgsl?raw";
import { EventManager } from "mjolnir.js";

async function main() {
    const adapter = await getAdapter();
    const device = await getDevice(adapter);

    const canvas = getCanvas();
    const context = getContext(canvas);

    const preferredCanvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: preferredCanvasFormat,
    });

    const module = device.createShaderModule({
        code: shaderCode,
    });

    const pipeline = device.createRenderPipeline({
        vertex: { module },
        layout: "auto",
        fragment: {
            module,
            targets: [{ format: preferredCanvasFormat }],
        },
    });

    const state = {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,

        zoom: 0,
        position: { x: 0, y: 0 },
        pan: { x: 0, y: 0 },
    };

    const viewUniformBufferSize = 4 * 4 * 3; // mat3x3f (3 x 4 + 4 pad) x 3
    const viewUniformBuffer = device.createBuffer({
        size: viewUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const viewUniformValues = new Float32Array(viewUniformBufferSize / 4);
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: viewUniformBuffer,
                },
            },
        ],
    });

    const eventManager = new EventManager(canvas, {});

    eventManager.on({
        wheel: (e) => {
            state.zoom += e.delta * 0.001;
            render();
        },
        panmove: (e) => {
            state.pan.x = e.deltaX;
            state.pan.y = -e.deltaY;
            render();
        },
        panend: () => {
            state.position.x += state.pan.x;
            state.position.y += state.pan.y;
            state.pan.x = 0;
            state.pan.y = 0;
            render();
        },
    });

    function render() {
        const effectiveZoom = Math.pow(Math.E, state.zoom);
        // Update Uniforms
        const scaleMatrix = mat3.scaling([
            2 / state.clientWidth,
            2 / state.clientHeight,
        ]);
        const panMatrix = mat3.translation([
            state.position.x + state.pan.x,
            state.position.y + state.pan.y,
        ]);
        const zoomMatrix = mat3.scaling([effectiveZoom, effectiveZoom]);

        let projectionMatrix = mat3.identity();
        projectionMatrix = mat3.multiply(projectionMatrix, scaleMatrix);
        projectionMatrix = mat3.multiply(projectionMatrix, panMatrix);
        projectionMatrix = mat3.multiply(projectionMatrix, zoomMatrix);

        viewUniformValues.set(projectionMatrix);
        device.queue.writeBuffer(viewUniformBuffer, 0, viewUniformValues);

        // Create Encoder and Pass
        const commandEncoder = device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();
        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: [0.8, 0.8, 0.8, 1],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        };
        const pass = commandEncoder.beginRenderPass(renderPassDescriptor);

        // Set pipeline
        pass.setPipeline(pipeline);

        // Set bind grups
        pass.setBindGroup(0, bindGroup);

        // Draw
        pass.draw(6);

        // End Pass
        pass.end();

        // Create and submit command buffer
        const commandBuffer = commandEncoder.finish();
        device.queue.submit([commandBuffer]);
    }

    canvasResizeObserver(
        canvas,
        ({ width, height, clientWidth, clientHeight }) => {
            state.width = width;
            state.height = height;
            state.clientWidth = clientWidth;
            state.clientHeight = clientHeight;

            render();
        },
    );
}

main();
