import { mat4 } from "wgpu-matrix";
import { canvasResizeObserver } from "../utils/canvasResizeObserver";
import {
    getAdapter,
    getCanvas,
    getContext,
    getDevice,
} from "../utils/webgpuSetup";
import { loadData } from "./loadData";
import { mapControls } from "./mapControls";
import shaderCode from "./shader.wgsl?raw";

async function main() {
    const imageData = await loadData();

    const canvas = getCanvas();
    const adapter = await getAdapter();
    const device = await getDevice(adapter);
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
        },
        fragment: {
            module,
            targets: [{ format: preferredCanvasFormat }],
        },
    });

    // Unit Sizes
    const unitSize = {
        // mat4x4
        mat4x4f: 4 * 4 * 4,
        // vec3
        vec3f: 3 * 4,
        vec3u: 3 * 4,
        vec3i: 3 * 4,
        // vec2
        vec2f: 2 * 4,
        vec2u: 2 * 4,
        // Singles
        i32: 4,
        f32: 4,
        u32: 4,
        // Padding
        pad4: 4,
    };

    // ---- UNIFORMS ----
    const uniformBufferSize = 2 * unitSize.mat4x4f;
    const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformData = new Float32Array(uniformBufferSize / 4);
    const projectMatrix = uniformData.subarray(0, 16);
    const viewMatrix = uniformData.subarray(16, 32);

    mat4.identity(projectMatrix);
    mat4.identity(viewMatrix);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    function updateProjectMatrix(width: number, height: number) {
        mat4.ortho(0, width, height, 0, -10, 10, projectMatrix);
        device.queue.writeBuffer(uniformBuffer, 0, projectMatrix);
    }

    // state is the center
    function updateViewMatrix(
        state: { x: number; y: number; zoom: number },
        width: number,
        height: number,
    ) {
        console.log("UPDATING VIEW", state, width, height);

        const scale = Math.exp(state.zoom);

        // What is translate value
        // such that state.x = 0.5 * width and state.y = 0.5 * width

        const tx = 0.5 * width - state.x * scale;
        const ty = 0.5 * height - state.y * scale;

        mat4.identity(viewMatrix);
        mat4.translate(viewMatrix, [tx, ty, 0], viewMatrix);
        mat4.scale(viewMatrix, [scale, scale, 1], viewMatrix);

        device.queue.writeBuffer(uniformBuffer, 16 * 4, viewMatrix);
    }

    // ---- Image Data ----

    const imageDataUniformSize = unitSize.vec2u;
    const imageDataUniformBuffer = device.createBuffer({
        size: imageDataUniformSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const imageDataUniformData = new Uint32Array(2);
    imageDataUniformData.set([imageData.width, imageData.height]);
    device.queue.writeBuffer(imageDataUniformBuffer, 0, imageDataUniformData);
    // not updateable, no fns

    const samples = imageData.bands.length;
    const texture = device.createTexture({
        size: [imageData.width, imageData.height, samples],
        format: "r16sint",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    imageData.bands.forEach((band, i) => {
        device.queue.writeTexture(
            { texture, origin: { z: i } },
            band.values,
            { bytesPerRow: imageData.width * 2 },
            {
                width: imageData.width,
                height: imageData.height,
                depthOrArrayLayers: 1,
            },
        );
    });
    // not updateable, no fns

    // ---- Multi Band Image Instance ----

    const numInstances = samples * samples * samples;
    // prettier-ignore
    const multiBandUnitSize =
        unitSize.mat4x4f +                  // model_matrix
        unitSize.vec3u + unitSize.pad4 +    // band_index
        unitSize.vec3i + unitSize.pad4 +    // min_val
        unitSize.vec3i + unitSize.pad4; // max_val

    const multiBandBufferSize = numInstances * multiBandUnitSize;
    const multiBandBuffer = device.createBuffer({
        size: multiBandBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const multiBandData = new ArrayBuffer(multiBandBufferSize);
    const multiBandDataF32 = new Float32Array(multiBandData);
    const multiBandDataU32 = new Uint32Array(multiBandData);
    const multiBandDataI32 = new Uint32Array(multiBandData);

    for (let z = 0; z < samples; z++) {
        for (let y = 0; y < samples; y++) {
            for (let x = 0; x < samples; x++) {
                setMultiBandImage(x, y, z);
            }
        }
    }

    function setMultiBandImage(x: number, y: number, z: number) {
        let instanceIndex = z * samples * samples + y * samples + x;
        let offset = (instanceIndex * multiBandUnitSize) / 4;
        const modelMatrix = multiBandDataF32.subarray(offset + 0, offset + 16);
        const bandIndex = multiBandDataU32.subarray(offset + 16, offset + 19);
        const minVal = multiBandDataI32.subarray(offset + 20, offset + 23);
        const maxVal = multiBandDataI32.subarray(offset + 24, offset + 27);

        const gap = 20;
        const blockHeight = samples * (imageData.height + gap);

        mat4.identity(modelMatrix);
        mat4.translate(
            modelMatrix,
            [
                x * (imageData.width + gap),
                y * (imageData.height + gap) + z * (blockHeight + 5 * gap),
                0,
            ],

            modelMatrix,
        );

        bandIndex.set([x, y, z]);
        minVal.set([
            imageData.bands[x].min,
            imageData.bands[y].min,
            imageData.bands[z].min,
        ]);
        maxVal.set([
            imageData.bands[x].max,
            imageData.bands[y].max,
            imageData.bands[z].max,
        ]);
    }

    device.queue.writeBuffer(multiBandBuffer, 0, multiBandData);
    // not updateable, no fns

    // ---- Bind Groups ----

    const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    const imageDataBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [
            { binding: 0, resource: { buffer: imageDataUniformBuffer } },
            { binding: 1, resource: texture.createView() },
        ],
    });

    const multiBandBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(2),
        entries: [{ binding: 0, resource: { buffer: multiBandBuffer } }],
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
        pass.setBindGroup(1, imageDataBindGroup);
        pass.setBindGroup(2, multiBandBindGroup);
        pass.draw(6, numInstances);

        pass.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }

    const canvasSizeState = {
        width: 1,
        height: 1,
        clientWidth: 1,
        clientHeight: 1,
    };

    canvasResizeObserver(canvas, (canvasSize) => {
        canvasSizeState.width = canvasSize.width;
        canvasSizeState.height = canvasSize.height;
        canvasSizeState.clientWidth = canvasSize.clientWidth;
        canvasSizeState.clientHeight = canvasSize.clientHeight;

        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
        updateProjectMatrix(canvasSize.clientWidth, canvasSize.clientHeight);
        updateViewMatrix(viewState, canvas.clientWidth, canvas.clientHeight);
        render();
    });

    const viewState = {
        x: 3 * imageData.width,
        y: 3 * imageData.height,
        zoom: -0.5,
    };

    // Map Controls
    //
    // Go there but it's not pretty.
    // Previously I had both a pan and a
    // center amount in my viewstate and that might make more sense.
    //
    // The main issue is, pan deltas are in view space coordinates (i.e. screen client pixels)
    // But my viewState.xy were in world space coordinates ()
    mapControls({
        element: canvas,
        onPanDelta(dx, dy) {
            viewState.x -= dx / Math.exp(viewState.zoom);
            viewState.y -= dy / Math.exp(viewState.zoom);

            updateViewMatrix(
                viewState,
                canvasSizeState.clientWidth,
                canvasSizeState.clientHeight,
            );
            render();
        },
        onZoomDelta(dz) {
            viewState.zoom += dz;
            updateViewMatrix(
                viewState,
                canvasSizeState.clientWidth,
                canvasSizeState.clientHeight,
            );
            render();
        },
    });
}

main();
