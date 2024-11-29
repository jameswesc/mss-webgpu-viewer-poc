// ---- Vertex ----

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
}

@vertex fn vertex_shader(
    @builtin(vertex_index) vertex_index: u32,
) -> VertexOutput {

    let quad_points = array(
        vec2f(-1, -1),  // left bottom
        vec2f( 1, -1),  // right bottom
        vec2f(-1,  1),  // left top
        vec2f(-1,  1),  // left top
        vec2f( 1, -1),  // right bottom
        vec2f( 1,  1),  // right top
    );
    let quad_position = quad_points[vertex_index];


    var vs_out : VertexOutput;
    vs_out.position = vec4f(quad_position, 0, 1);
    vs_out.texcoord = quad_position * 0.5 + 0.5;
    vs_out.texcoord.y = 1 - vs_out.texcoord.y;

    return vs_out;
}

// ---- Uniforms ----

struct ImageUniforms {
    size: vec2<u32>,
}

struct DisplayUniforms {
    band_index: vec3<u32>,
    spectral_index: i32,
    min_val: vec3<i32>,
    draw_mode: i32,
    max_val: vec3<i32>,
    colormap: i32,
}

// Draw Mode Options
const SINGLE_BAND = 0;
const MULTI_BAND = 1;
const SPECTRAL_INDEX = 2;

// Colormap Options
const GREY = 0;
const VIRIDIS = 1;
const INFERNO = 2;
const PLASMA = 3;
const MAGMA = 4;

// Spectral Index Options
const NDVI = 0;
const NDWI = 1;

const GREEN_NDX = 2;
const RED_NDX = 3;
const NIR_NDX = 4;

@group(0) @binding(0) var<uniform> image_uniforms: ImageUniforms;
@group(0) @binding(1) var<uniform> display_uniforms: DisplayUniforms;

// ---- Textures ----

@group(0) @binding(2) var textures: texture_2d_array<i32>;

// ---- Fragment ----

@fragment fn fragment_shader(vs_out: VertexOutput) -> @location(0) vec4<f32> {

    let size : vec2<u32> = image_uniforms.size;
    let tex_index : vec2<u32> = vec2u(floor(vs_out.texcoord * vec2f(size)));
    let band_index :vec3<u32> = display_uniforms.band_index;

    var color : vec3f;

    if display_uniforms.draw_mode == MULTI_BAND {

        let texel: vec3<i32> = vec3i(
            textureLoad(textures, tex_index, band_index.r, 0)[0],
            textureLoad(textures, tex_index, band_index.g, 0)[0],
            textureLoad(textures, tex_index, band_index.b, 0)[0],
        );

        color = normalise_value(
            texel, display_uniforms.min_val, display_uniforms.max_val
        );

    } else if display_uniforms.draw_mode == SINGLE_BAND {

        let texel : vec3<i32> = vec3i(
            textureLoad(textures, tex_index, band_index.r, 0)[0]
        );
        let t : f32 = normalise_value(
            texel, display_uniforms.min_val, display_uniforms.max_val
        )[0];

        color = apply_sequential_colormap(t, display_uniforms.colormap);

    } else if display_uniforms.draw_mode == SPECTRAL_INDEX {

        let spectral_index = display_uniforms.spectral_index;
        var t: f32;

        if spectral_index == NDVI {
            t = ndvi(tex_index);
        } else if spectral_index == NDWI {
            t = ndwi(tex_index);
        }

        t = t * 0.5 + 0.5;
        color = twilight(1 - t);
    }


    return vec4f(color, 1);
}

fn normalise_value(val: vec3<i32>, min_val: vec3<i32>, max_val: vec3<i32>) -> vec3<f32> {
    return clamp(vec3f(val - min_val) / vec3f(max_val - min_val), vec3f(0), vec3f(1));
}

// ---- Spectral Indicies ----

fn ndvi(tex_index: vec2<u32>) -> f32 {
    let n = textureLoad(textures, tex_index, NIR_NDX, 0)[0];
    let r = textureLoad(textures, tex_index, RED_NDX, 0)[0];

    return f32(n - r) / f32(n + r);
}

fn ndwi(tex_index: vec2<u32>) -> f32 {
    let n = textureLoad(textures, tex_index, NIR_NDX, 0)[0];
    let g = textureLoad(textures, tex_index, GREEN_NDX, 0)[0];

    return f32(g - n) / f32(g + n);
}

fn twilight(_t: f32) -> vec3f {

    let t = _t * 6.283185307179586;

    var cs1 = vec2f(cos(t), sin(t));
    var cs2 = vec2f(cs1.x*cs1.x - cs1.y*cs1.y, 2.0*cs1.x*cs1.y);

    var n : vec3f = vec3f(0.604241906517949, 0.4211209742387994, 0.5654329623884283);
    n += vec3f(0.3786081652411069, 0.4231873615015874, 0.3006285459149778)*cs1.x;
    n += vec3f(-0.3806740645833865, -0.2192933437505726, 0.297215004243999)*cs1.y;
    n += vec3f(-0.1225310774589317, 0.05262481606068274, -0.1299696350001923)*cs2.x;
    n += vec3f(-0.209793460377647, -0.08229299637364859, 0.2043188473156559)*cs2.y;

    var d : vec3f = vec3f(1.0);
    d += vec3f(0.2411111517951086, 0.1090036451124381, 0.1358630678955726)*cs1.x;
    d += vec3f(-0.3611005116375753, -0.7206085364851942, 0.09738419152461333)*cs1.y;
    d += vec3f(-0.2459830263163363, -0.04512164179268539, -0.2825334376412894)*cs2.x;
    d += vec3f(-0.2362425339299566, 0.1115700597048391, 0.3416930715651435)*cs2.y;

    return n / d;

}

// ---- Color Maps ----

fn apply_sequential_colormap(t: f32, colormap: i32) -> vec3<f32> {
    var color : vec3f;

    if colormap == VIRIDIS {
        color = viridis(t);
    } else if colormap == PLASMA {
        color = plasma(t);
    } else if colormap == INFERNO {
        color = inferno(t);
    } else if colormap == MAGMA {
        color = magma(t);
    } else {
        color = vec3f(t);
    }

    return color;
}

fn viridis(t: f32) -> vec3f {
    let c0 = vec3f(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
    let c1 = vec3f(0.1050930431085774, 1.404613529898575, 1.384590162594685);
    let c2 = vec3f(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
    let c3 = vec3f(-4.634230498983486, -5.799100973351585, -19.33244095627987);
    let c4 = vec3f(6.228269936347081, 14.17993336680509, 56.69055260068105);
    let c5 = vec3f(4.776384997670288, -13.74514537774601, -65.35303263337234);
    let c6 = vec3f(-5.435455855934631, 4.645852612178535, 26.3124352495832);

    return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));
}

fn plasma(t: f32) -> vec3f {

    let c0 = vec3f(0.05873234392399702, 0.02333670892565664, 0.5433401826748754);
    let c1 = vec3f(2.176514634195958, 0.2383834171260182, 0.7539604599784036);
    let c2 = vec3f(-2.689460476458034, -7.455851135738909, 3.110799939717086);
    let c3 = vec3f(6.130348345893603, 42.3461881477227, -28.51885465332158);
    let c4 = vec3f(-11.10743619062271, -82.66631109428045, 60.13984767418263);
    let c5 = vec3f(10.02306557647065, 71.41361770095349, -54.07218655560067);
    let c6 = vec3f(-3.658713842777788, -22.93153465461149, 18.19190778539828);

    return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));

}

fn magma(t: f32) -> vec3f {

    let c0 = vec3f(-0.002136485053939582, -0.000749655052795221, -0.005386127855323933);
    let c1 = vec3f(0.2516605407371642, 0.6775232436837668, 2.494026599312351);
    let c2 = vec3f(8.353717279216625, -3.577719514958484, 0.3144679030132573);
    let c3 = vec3f(-27.66873308576866, 14.26473078096533, -13.64921318813922);
    let c4 = vec3f(52.17613981234068, -27.94360607168351, 12.94416944238394);
    let c5 = vec3f(-50.76852536473588, 29.04658282127291, 4.23415299384598);
    let c6 = vec3f(18.65570506591883, -11.48977351997711, -5.601961508734096);

    return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));

}

fn inferno(t : f32) -> vec3f {

    let c0 = vec3f(0.0002189403691192265, 0.001651004631001012, -0.01948089843709184);
    let c1 = vec3f(0.1065134194856116, 0.5639564367884091, 3.932712388889277);
    let c2 = vec3f(11.60249308247187, -3.972853965665698, -15.9423941062914);
    let c3 = vec3f(-41.70399613139459, 17.43639888205313, 44.35414519872813);
    let c4 = vec3f(77.162935699427, -33.40235894210092, -81.80730925738993);
    let c5 = vec3f(-71.31942824499214, 32.62606426397723, 73.20951985803202);
    let c6 = vec3f(25.13112622477341, -12.24266895238567, -23.07032500287172);

    return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));

}
