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
        layout: "auto",
        vertex: {
            module,
            buffers: [
                {
                    arrayStride: 16, // vec2f + vec2f
                    stepMode: "instance",
                    attributes: [
                        // Size
                        { shaderLocation: 0, offset: 0, format: "float32x2" },
                        // Offset
                        { shaderLocation: 1, offset: 8, format: "float32x2" },
                    ],
                },
            ],
        },
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

    const vertexBuffer = device.createBuffer({
        size: 4 * 16,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const vertexBufferValues = new Float32Array([
        200, 200, 20, 20, 400, 200, 20, 240,
    ]);

    device.queue.writeBuffer(vertexBuffer, 0, vertexBufferValues);

    const eventManager = new EventManager(canvas, {});

    eventManager.on({
        wheel: (e) => {
            state.zoom += e.delta * 0.001;
            render();
        },
        panmove: (e) => {
            state.pan.x = e.deltaX;
            state.pan.y = e.deltaY;
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
        canvas.width = state.width;
        canvas.height = state.height;

        // ---- Projection Matrix ----
        // We want to warp space from clip space x: -1 <-> 1 and y: -1 <-> 1
        // to screen space x: 0 <-> width and y: height <-> 0

        // Shift left 1 unit, up 1 unit
        // x: 0 <-> 2, y: 0 <-> 2
        const shiftMatrix = mat3.translation([-1, 1]);
        // Scale down by to half width and height
        // x: 0 <-> width, y: height <-> 0
        const scaleMatrix = mat3.scaling([
            2 / state.clientWidth,
            -2 / state.clientHeight,
        ]);
        let projectionMatrix = mat3.identity();
        projectionMatrix = mat3.multiply(projectionMatrix, shiftMatrix);
        projectionMatrix = mat3.multiply(projectionMatrix, scaleMatrix);

        // ---- View Matrix ----
        const effectiveZoom = Math.pow(Math.E, state.zoom);
        const xPos = state.position.x + state.pan.x;
        const yPos = state.position.y + state.pan.y;
        let viewMatrix = mat3.identity();
        const panMatrix = mat3.translation([xPos, yPos]);
        const zoomMatrix = mat3.scaling([effectiveZoom, effectiveZoom]);
        viewMatrix = mat3.multiply(viewMatrix, panMatrix);
        viewMatrix = mat3.multiply(viewMatrix, zoomMatrix);

        const projectionViewMatrix = mat3.multiply(
            projectionMatrix,
            viewMatrix,
        );

        viewUniformValues.set(projectionViewMatrix);
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
        pass.setVertexBuffer(0, vertexBuffer);
        pass.setBindGroup(0, bindGroup);

        // Draw
        pass.draw(6, 2);

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
