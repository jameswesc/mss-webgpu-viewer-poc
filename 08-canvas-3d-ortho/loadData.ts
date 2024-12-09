import { fromUrl } from "geotiff";

export type Band = {
    label?: string;
    min: number;
    max: number;
    values: Int16Array;
};

export type ImageData = {
    width: number;
    height: number;
    bands: Band[];
};

export async function loadData(): Promise<ImageData> {
    const tiff = await fromUrl("/landsat.tiff");
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();

    const imageData: ImageData = {
        width,
        height,
        bands: [],
    };

    const rasters = await image.readRasters();

    // Hardcoded for now
    const rasterLablels = [
        "blue",
        "green",
        "red",
        "nir",
        "swir1",
        "swir2",
        "oa_fmask",
    ];

    for (let i = 0; i < rasters.length; i++) {
        const values = rasters[i] as Int16Array;
        const label = rasterLablels[i];

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
            label,
            min,
            max,
            values,
        };

        imageData.bands.push(band);
    }

    return imageData;
}
