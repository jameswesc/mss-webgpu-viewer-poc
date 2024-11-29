struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
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

@group(0) @binding(0) var textures: texture_2d_array<i32>;

// ---- Fragment ----
@fragment fn fragment_shader(vs_out: VertexOutput) -> @location(0) vec4<f32> {

    let size : vec2<u32> = vec2(8, 6);
    let tex_index : vec2<u32> = vec2u(floor(vs_out.texcoord * vec2f(size)));

    let texel: vec3<i32> = vec3i(
        textureLoad(textures, tex_index, 0, 0)[0],
        textureLoad(textures, tex_index, 1, 0)[0],
        textureLoad(textures, tex_index, 2, 0)[0],
    );

    let color = vec3f(texel) / 10000;

    return vec4f(color, 1);
}
