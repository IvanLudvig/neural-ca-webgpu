struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) cellCoords: vec2u,
}

const WIDTH = 40u;
const HEIGHT = 40u;
const CHANNELS = 16u;

const vertices = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0)
);

@group(0) @binding(0) var<storage, read> imageData: array<f32>;

@vertex
fn vs(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    var output: VertexOutput;

    let cellCoords = vec2u(
        instanceIndex % WIDTH, 
        instanceIndex / WIDTH
    );
    let cellSize = 2.0 / vec2f(f32(WIDTH), f32(HEIGHT));
    let cellPos = vec2f(cellCoords) * cellSize - 1.0;
    let vertexPos = vertices[vertexIndex] * cellSize;

    output.position = vec4f(vertexPos + cellPos, 0.0, 1.0);
    output.cellCoords = cellCoords;

    return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let i = (input.cellCoords.y * WIDTH + input.cellCoords.x) * CHANNELS;

    let r = imageData[i];
    let g = imageData[i + 1u];
    let b = imageData[i + 2u];

    return vec4f(r, g, b, 1.0);
}
