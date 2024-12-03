type SizeDetails = {
    width: number;
    height: number;
    clientWidth: number;
    clientHeight: number;
};

type ResizeFunction = (details: SizeDetails) => void;

export function canvasResizeObserver(
    canvas: HTMLCanvasElement,
    onResize: ResizeFunction,
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

        width = Math.max(1, width);
        height = Math.max(1, height);

        onResize({
            width,
            height,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
        });
    });

    observer.observe(canvas);
}
