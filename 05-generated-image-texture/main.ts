import { renderOnResizeObserver } from "../utils/renderOnResizeObserver";
import { createDefaultRenderPass } from "../utils/renderPass";
import { initWebGPU } from "../utils/webgpuSetup";
import shaderCode from "./shader.wgsl?raw";

async function main() {
    const { device, context, canvas, format } = await initWebGPU();

    const module = device.createShaderModule({
        label: "Shader Module",
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

    const width = 8;
    const height = 6;
    const pixels = width * height;
    const textures = 3;

    const texture = device.createTexture({
        format: "r16sint",
        size: { width, height, depthOrArrayLayers: textures },
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    for (let tNdx = 0; tNdx < textures; tNdx++) {
        const data = new Int16Array(pixels);
        for (let i = 0; i < pixels; i++) {
            const t = i / (pixels - 1);
            const c = Math.floor(t * 10_000);
            data.set([c], i);
        }

        device.queue.writeTexture(
            { texture, origin: { z: tNdx } },
            data,
            { bytesPerRow: width * 2 },
            { width, height, depthOrArrayLayers: 1 },
        );
    }

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: texture.createView({ dimension: "2d-array" }),
            },
        ],
    });

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
}

main();
