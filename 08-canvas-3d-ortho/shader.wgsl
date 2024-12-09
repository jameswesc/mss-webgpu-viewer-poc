// ---- ---- GLOBAL DATA  ---- ----
// Group: 0

// ---- Uniforms ----
// Binding: 0

struct Uniform {
    view_proj_mat: mat4x4<f32>
}

@group(0) @binding(0) var<uniform> uni: Uniform;

// ---- Band Data Textures ----
// Binding: 1

@group(0) @binding(1) var textures: texture_2d_array<i32>;

// ---- ---- PER INSTANCE DATA ---- ----
// Group: 1

struct InstanceData {
    model_mat: mat4x4<f32>
}

@group(1) @binding(0) var<storage, read> instance_data: array<InstanceData>;

// ---- ---- VERTEX ---- ----

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
}

@vertex fn vertex_shader(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32,
) -> VertexOutput {

    let quad_points = array(
        vec2f(-0.5, -0.5),  // left bottom
        vec2f(0.5, -0.5),  // right bottom
        vec2f(-0.5, 0.5),  // left top
        vec2f(-0.5, 0.5),  // left top
        vec2f(0.5, -0.5),  // right bottom
        vec2f(0.5, 0.5),  // right top
    );

    let vertex_pos : vec2f = quad_points[vertex_index];

    let model_mat = instance_data[instance_index].model_mat;
    let view_proj_mat = uni.view_proj_mat;
    let pos = vec4f(vertex_pos, 0, 1);

    let position = view_proj_mat * model_mat * pos;

    var vs_out : VertexOutput;
    vs_out.position = position;

    // CHANGE THIS LATER
    vs_out.texcoord = vertex_pos * 0.5 + 0.5;

    return vs_out;
}

// ---- ---- FRAGMENT ---- ----

@fragment fn fragment_shader(vs_out: VertexOutput) -> @location(0) vec4<f32> {

    let tex_index : vec2<u32> = vec2u(0, 0);
    let texel = textureLoad(textures, tex_index, 0, 0)[0];

    return vec4f(1, 0, 0, 1);
}
