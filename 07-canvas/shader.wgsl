// ---- Uniforms ----

struct ViewUniforms {
    projection_matrix: mat3x3<f32>,
}

@group(0) @binding(0) var<uniform> view_uniforms: ViewUniforms;

// ---- Vertex ----

struct Vertex {
    @location(0) size: vec2<f32>,
    @location(1) offset: vec2<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
}

@vertex fn vertex_shader(
    vert: Vertex,
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32,
) -> VertexOutput {


    let quad_points = array(
        vec2f(-0.5, -0.5),  // left bottom
        vec2f( 0.5, -0.5),  // right bottom
        vec2f(-0.5,  0.5),  // left top
        vec2f(-0.5,  0.5),  // left top
        vec2f( 0.5, -0.5),  // right bottom
        vec2f( 0.5,  0.5),  // right top
    );

    let quad_position = quad_points[vertex_index] * vert.size + vert.offset;

    let proj_mat = view_uniforms.projection_matrix;

    let position : vec3f = proj_mat * vec3f(quad_position, 1);

    var vs_out : VertexOutput;
    vs_out.position = vec4f(position.xy, 0, 1);
    vs_out.texcoord = quad_position + 0.5;
    vs_out.texcoord.y = 1 - vs_out.texcoord.y;

    return vs_out;
}

// ---- Fragment ----

@fragment fn fragment_shader(vs_out: VertexOutput) -> @location(0) vec4<f32> {
    return vec4f(1, 0, 0, 1);
}
