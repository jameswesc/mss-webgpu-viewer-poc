export function renderOnResizeObserver(
    canvas: HTMLCanvasElement,
    render: () => void,
    maxSize?: number,
) {
    const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        const canvas = <HTMLCanvasElement>entry.target;

        const dpr = Math.min(devicePixelRatio, 2);

        let width =
            entry.devicePixelContentBoxSize?.[0].inlineSize ||
            entry.contentBoxSize[0].inlineSize * dpr;
        let height =
            entry.devicePixelContentBoxSize?.[0].blockSize ||
            entry.contentBoxSize[0].blockSize * dpr;

        if (maxSize) {
            width = Math.min(width, maxSize);
            height = Math.min(height, maxSize);
        }
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        render();
    });

    observer.observe(canvas);
}
