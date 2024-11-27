// ---- Uniforms ----
struct ImageUniforms {
    size: vec2<u32>,
    samples: u32,
}

struct DisplayUniforms {
    sample_index: vec3<u32>,
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
    return vec3f(val - min_val) / vec3f(max_val - min_val);
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

    // let size_f = vec2f(size);
    let pixel_xy : vec2<u32> = vec2u(floor(vs_out.texcoord * vec2f(size)));
    let pixel_index : u32 = pixel_xy.x + pixel_xy.y * size.x;

    let values_offset: u32 = pixel_index * samples;

    let raw_val = vec3i(
        values[values_offset + sample_index.x],
        values[values_offset + sample_index.y],
        values[values_offset + sample_index.z],
    );

    let color_val : vec3f = normalise_value(raw_val, display_uniforms.min_val, display_uniforms.max_val);

    return vec4f(color_val, 1);
}
