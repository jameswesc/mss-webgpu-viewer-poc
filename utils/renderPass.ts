export function createDefaultRenderPass(
    device: GPUDevice,
    context: GPUCanvasContext,
) {
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

    return { encoder, pass };
}
