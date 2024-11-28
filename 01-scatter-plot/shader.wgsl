// Uniforms

struct SizeUniforms {
    resolution: vec2<f32>,
}

struct PlotUniforms {
    val_ndx: vec2<u32>,
    x_domain: vec2<i32>,
    y_domain: vec2<i32>,
    size: f32,
    stride: u32,
}

@group(0) @binding(0) var<uniform> size_u: SizeUniforms;
@group(0) @binding(1) var<uniform> plot_u: PlotUniforms;

// Storage buffer

@group(1) @binding(0) var<storage, read> values: array<i32>;

// Vertex

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
}

// could do this better as vec2
fn normalise_value(value: i32, domain: vec2<i32>) -> f32 {
    let min = domain[0];
    let max = domain[1];
    let scaled : f32 = f32(value - min) / f32(max - min);
    return scaled * 2 - 1;
}

@vertex fn vertex_shader(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32
) -> VertexOutput {

    let quad_points = array(
        vec2f(-1, -1),
        vec2f( 1, -1),
        vec2f(-1,  1),
        vec2f(-1,  1),
        vec2f( 1, -1),
        vec2f( 1,  1),
    );
    let quad_position = quad_points[vertex_index];
    let quad_offset = quad_position *
        plot_u.size / size_u.resolution;

    // TODO - programatically choose which one to take
    let x_value : i32 = values[instance_index * plot_u.stride + plot_u.val_ndx[0]];
    let y_value : i32 = values[instance_index * plot_u.stride + plot_u.val_ndx[1]];
    let x_clip : f32 = normalise_value(x_value, plot_u.x_domain);
    let y_clip : f32 = normalise_value(y_value, plot_u.y_domain);

    let position : vec2<f32> = vec2f(x_clip, y_clip);

    var vs_out : VertexOutput;
    vs_out.position = vec4f(
        position + quad_offset,
        0,
        1
    );

    return vs_out;
}

// Fragment

@fragment fn fragment_shader(vs_out: VertexOutput) -> @location(0) vec4<f32> {
    return vec4f(1.0, 1.0, 0.2, 1.0);
}
