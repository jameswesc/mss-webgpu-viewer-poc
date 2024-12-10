// ---- Global Data ----

struct Uniform {
    project_matrix: mat4x4<f32>,
    view_matrix: mat4x4<f32>
}

@group(0) @binding(0) var<uniform> uni: Uniform;

// ---- Image Dataset ----

struct ImageDataUniform {
    size: vec2<u32>,
}

@group(1) @binding(0) var<uniform> image_data_uniform: ImageDataUniform;
@group(1) @binding(1) var textures: texture_2d_array<f32>;

// ---- Multi Band Image ----

struct MultiBandImage {
    model_matrix: mat4x4<f32>,
    band_index: vec3<u32>,
    min_val: vec3<f32>,
    max_val: vec3<f32>
}

@group(2) @binding(0) var<storage, read> multi_band_image: array<MultiBandImage>;

// ---- Vertex ----

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texture_index: vec2<f32>,
    @location(1) @interpolate(flat) band_index: vec3<u32>,
    @location(2) @interpolate(flat) min_val: vec3<f32>,
    @location(3) @interpolate(flat) max_val: vec3<f32>,
}

@vertex fn vertex_shader(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32,
) -> VertexOutput {

    let quad_points = array(
        vec2f(0, 0),  // left bottom
        vec2f(1, 0),   // right bottom
        vec2f(0, 1),   // left top
        vec2f(0, 1),   // left top
        vec2f(1, 0),   // right bottom
        vec2f(1, 1),    // right top
    );

    var vertex_position : vec2<f32> = quad_points[vertex_index];

    let size_f32: vec2<f32> = vec2f(image_data_uniform.size);

    let texture_coord : vec2<f32> = vertex_position;
    let texture_index : vec2<f32> = texture_coord * size_f32;

    vertex_position = vertex_position * size_f32;

    let project : mat4x4<f32> = uni.project_matrix;
    let view : mat4x4<f32> = uni.view_matrix;
    let model : mat4x4<f32> = multi_band_image[instance_index].model_matrix;
    let position: vec4<f32> = project * view * model * vec4(vertex_position, 0, 1);



    var vertex_output : VertexOutput;
    vertex_output.position = position;
    vertex_output.texture_index = texture_index;

    vertex_output.band_index = multi_band_image[instance_index].band_index;
    vertex_output.min_val = multi_band_image[instance_index].min_val;
    vertex_output.max_val = multi_band_image[instance_index].max_val;

    return vertex_output;
}

@fragment fn fragment_shader(vertex_output: VertexOutput) -> @location(0) vec4<f32> {

    let band_index = vertex_output.band_index;
    let min_val = vertex_output.min_val;
    let max_val = vertex_output.max_val;

    let texture_index : vec2<u32> = vec2u(floor(vertex_output.texture_index));
    let texel : vec3<f32> = vec3f(
        textureLoad(textures, texture_index, band_index.r, 0)[0],
        textureLoad(textures, texture_index, band_index.g, 0)[0],
        textureLoad(textures, texture_index, band_index.b, 0)[0],
    );

    let color : vec3<f32> = normalise_value(texel, min_val, max_val);

    return vec4f(color, 1);
}

fn normalise_value(val: vec3<f32>, min_val: vec3<f32>, max_val: vec3<f32>) -> vec3<f32> {
    return clamp((val - min_val) / (max_val - min_val), vec3f(0), vec3f(1));
}
