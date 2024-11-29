# 05 Generated Image Texture

This PoC was the same as [02-generated-image/](../02-generated-image/), but instead of using a single storage buffer we use an array of 2D textures. There's a couple of benefits to this:
* `textureLoad` allows us to look up texel using 2D coordinates. Though we can't use `textureSample` on an `i32` texture. So we still have to map from normalised texcoords (`vec2f`) to actual texel coordinates (`vec2u`).
* Textures support many more formats than storage buffers and we can load our data in directly without having to convert it. In this case our data is in a `Int16Array` which we can load directly into a `r16sint` texture.
* Different textures in our array can easily be looked up using an index. i.e. easy to switch what band goes into the red, green and blue channels

## Results

![screenshot](./screenshots/s1.png)
