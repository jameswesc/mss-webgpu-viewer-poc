import { fromUrl } from "geotiff";

export type Band = {
    min: number;
    max: number;
    values: Float32Array;
};

export type ImageData = {
    width: number;
    height: number;
    bands: Band[];
};

export async function loadData(): Promise<ImageData> {
    const tiff = await fromUrl("/kakadu-sentinel-2.tiff");
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();

    const imageData: ImageData = {
        width,
        height,
        bands: [],
    };

    const rasters = await image.readRasters();

    for (let i = 0; i < rasters.length - 1; i++) {
        const values = new Float32Array(rasters[i] as Float64Array);

        let min = Infinity,
            max = 0;
        for (let j = 0; j < values.length; j++) {
            if (values[j] < min) {
                min = values[j];
            }
            if (values[j] > max) {
                max = values[j];
            }
        }

        const band = {
            min,
            max,
            values,
        };

        imageData.bands.push(band);
    }

    console.log(imageData);

    return imageData;
}
