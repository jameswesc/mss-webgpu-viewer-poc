// ---- Uniforms ----
struct ImageUniforms {
    size: vec2<u32>,
    samples: u32,
}

struct DisplayUniforms {
    sample_index: vec3<u32>,
    colormap: u32,
    min_val: vec3<i32>,
    max_val: vec3<i32>,
}

@group(0) @binding(0) var<uniform> image_uniforms: ImageUniforms;
@group(0) @binding(1) var<uniform> display_uniforms: DisplayUniforms;

// ---- Storage Buffer ----

@group(1) @binding(0) var<storage, read> values: array<i32>;


// ---- Vertex ----

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
}

fn normalise_value(val: vec3<i32>, min_val: vec3<i32>, max_val: vec3<i32>) -> vec3f {
    return clamp(vec3f(val - min_val) / vec3f(max_val - min_val), vec3f(0), vec3f(1));
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
    // vs_out.color = colors[vertex_index];

    return vs_out;
}

// ---- Fragment ----
@fragment fn fragment_shader(vs_out: VertexOutput) -> @location(0) vec4<f32> {

    let size : vec2<u32> = image_uniforms.size;
    let samples : u32 = image_uniforms.samples;

    let sample_index : vec3<u32> = display_uniforms.sample_index;
    let colormap = display_uniforms.colormap;

    // let size_f = vec2f(size);
    let pixel_xy : vec2<u32> = vec2u(floor(vs_out.texcoord * vec2f(size)));
    let pixel_index : u32 = pixel_xy.x + pixel_xy.y * size.x;

    let values_offset: u32 = pixel_index * samples;

    let raw_val = vec3i(
        values[values_offset + sample_index.x],
        values[values_offset + sample_index.y],
        values[values_offset + sample_index.z],
    );

    let normalised : vec3f = normalise_value(raw_val, display_uniforms.min_val, display_uniforms.max_val);

    var color : vec3f;
    if colormap == 1 {
        color = viridis(normalised.x);
    } else if colormap == 2 {
        color = plasma(normalised.x);
    } else if colormap == 3 {
        color = inferno(normalised.x);
    } else if colormap == 4 {
        color = magma(normalised.x);
    } else {
        color = normalised;
    }

    return vec4f(color, 1);
}

// Matplotlib colormap approximations
// taken from Matt Zucker on Shader Toy
// https://www.shadertoy.com/view/WlfXRN

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
