import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                poc1: resolve(__dirname, "01-scatter-plot/index.html"),
                poc2: resolve(__dirname, "02-generated-image/index.html"),
                poc3: resolve(__dirname, "03-landsat-image/index.html"),
                poc4: resolve(__dirname, "04-single-band/index.html"),
                poc5: resolve(__dirname, "05-generated-image-texture/index.html"),
                poc6: resolve(__dirname, "06-landsat-textures/index.html"),
                poc7: resolve(__dirname, "07-canvas/index.html"),
                poc8: resolve(__dirname, "08-canvas-3d-ortho/index.html"),
                poc9: resolve(__dirname, "09-multi-view/index.html"),
            },
        },
    },
});
