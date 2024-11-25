import { fromUrl } from "geotiff";

type Dimensions = {
    width: number;
    height: number;
};
export type ImageData = Int16Array[] & Dimensions;

export async function loadDataFromURL() {
    const tiff = await fromUrl("/landsat.tiff");
    const image = await tiff.getImage();

    console.info(image);

    // CHEAT - I know the data I'm testing with is multiple
    // 16 bit integer bands. So here I'm hard coding it.
    const data = <ImageData>await image.readRasters();
    return data;
}
