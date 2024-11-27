# Storage Buffer Image PoC

Normally when rendering an image to a quad, you would use a texture. The texture data often comes
from an image thats already in something like 8-bit RGB format. However, I already have all the MSS data
in one large storage buffer. I want to use this as the "texture" source and perform the normalisation on
the GPU.

For this fist PoC I'll just use random data generated into the storage buffer.
