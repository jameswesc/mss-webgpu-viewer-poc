import { EventManager } from "mjolnir.js";

type MapControlOptions = {
    element: HTMLCanvasElement;
    onZoomDelta: (delta: number) => void;
    onPanDelta: (deltaX: number, deltaY: number) => void;
};

export function mapControls(options: MapControlOptions) {
    const { element, onZoomDelta, onPanDelta } = options;

    const eventManager = new EventManager(element, {});

    let lastX = 0;
    let lastY = 0;

    eventManager.on({
        wheel: (e) => {
            onZoomDelta(e.delta * 0.001);
        },
        panstart: (e) => {
            lastX = e.deltaX;
            lastY = e.deltaY;
        },
        panmove: (e) => {
            onPanDelta(e.deltaX - lastX, e.deltaY - lastY);
            lastX = e.deltaX;
            lastY = e.deltaY;
        },
    });

    return eventManager.destroy;
}
