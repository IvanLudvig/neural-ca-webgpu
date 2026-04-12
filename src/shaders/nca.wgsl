const WIDTH = 40u;
const HEIGHT = 40u;
const CHANNELS = 16u;

@group(0) @binding(0) var<storage, read> stateIn: array<f32>;
@group(0) @binding(1) var<storage, read_write> stateOut: array<f32>;
@group(0) @binding(2) var<storage, read> fc0_weight: array<f32>;
@group(0) @binding(3) var<storage, read> fc0_bias: array<f32>;
@group(0) @binding(4) var<storage, read> fc1_weight: array<f32>;
@group(0) @binding(5) var<uniform> seed: u32;

fn getCell(x: i32, y: i32, c: u32) -> f32 {
    let wx = (x + i32(WIDTH)) % i32(WIDTH);
    let wy = (y + i32(HEIGHT)) % i32(HEIGHT);
    let idx = (u32(wy) * WIDTH + u32(wx)) * CHANNELS + c;
    return stateIn[idx];
}

fn setCell(x: u32, y: u32, c: u32, value: f32) {
    let idx = (y * WIDTH + x) * CHANNELS + c;
    stateOut[idx] = value;
}

fn perceive(x: i32, y: i32) -> array<f32, 48> {
    var perception: array<f32, 48>;

    let sobelX = array<f32, 9>(
        -0.125, 0.0, 0.125,
        -0.25,  0.0, 0.25,
        -0.125, 0.0, 0.125
    );

    let sobelY = array<f32, 9>(
        -0.125, -0.25, -0.125,
         0.0,    0.0,   0.0,
         0.125,  0.25,  0.125
    );

    let identity = array<f32, 9>(
        0.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 0.0, 0.0
    );

    for (var c = 0u; c < CHANNELS; c++) {
        var dx = 0.0;
        var dy = 0.0;
        var id = 0.0;

        var k = 0u;
        for (var dy_offset = -1; dy_offset <= 1; dy_offset++) {
            for (var dx_offset = -1; dx_offset <= 1; dx_offset++) {
                let val = getCell(x + dx_offset, y + dy_offset, c);
                dx += val * sobelX[k];
                dy += val * sobelY[k];
                id += val * identity[k];
                k++;
            }
        }

        perception[c] = id;
        perception[CHANNELS + c] = dx;
        perception[CHANNELS * 2u + c] = dy;
    }

    return perception;
}

fn linear_fc0(input: array<f32, 48>) -> array<f32, 128> {
    var output: array<f32, 128>;

    for (var i = 0u; i < 128u; i++) {
        var sum = fc0_bias[i];
        for (var j = 0u; j < 48u; j++) {
            sum += input[j] * fc0_weight[i * 48u + j];
        }
        output[i] = max(0.0, sum);
    }

    return output;
}

fn linear_fc1(input: array<f32, 128>) -> array<f32, 16> {
    var output: array<f32, 16>;

    for (var i = 0u; i < 16u; i++) {
        var sum = 0.0;
        for (var j = 0u; j < 128u; j++) {
            sum += input[j] * fc1_weight[i * 128u + j];
        }
        output[i] = sum;
    }

    return output;
}

fn hash(value: u32) -> u32 {
    var state = value;
    state = state ^ 2747636419u;
    state = state * 2654435769u;
    state = state ^ (state >> 16u);
    state = state * 2654435769u;
    state = state ^ (state >> 16u);
    state = state * 2654435769u;
    return state;
}

fn random(seed: u32) -> f32 {
    return f32(hash(seed)) / 4294967295.0;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let x = global_id.x;
    let y = global_id.y;

    if (x >= WIDTH || y >= HEIGHT) {
        return;
    }

    // Check pre-life mask (alive check on input state)
    var preMaxAlpha = 0.0;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            preMaxAlpha = max(preMaxAlpha, getCell(i32(x) + dx, i32(y) + dy, 3u));
        }
    }

    let preAlive = preMaxAlpha > 0.1;

    // If not alive, write zeros and return
    if (!preAlive) {
        for (var c = 0u; c < CHANNELS; c++) {
            setCell(x, y, c, 0.0);
        }
        return;
    }

    // Stochastic update
    let randSeed = seed + y * WIDTH + x;
    let shouldUpdate = random(randSeed) <= 0.5;

    // Compute the update
    var newState: array<f32, 16>;
    if (shouldUpdate) {
        let perception = perceive(i32(x), i32(y));
        let hidden = linear_fc0(perception);
        let delta = linear_fc1(hidden);

        for (var c = 0u; c < CHANNELS; c++) {
            let current = getCell(i32(x), i32(y), c);
            newState[c] = current + delta[c];
        }
    } else {
        // No update, copy current state
        for (var c = 0u; c < CHANNELS; c++) {
            newState[c] = getCell(i32(x), i32(y), c);
        }
    }

    // Post-life mask: check if cell's new alpha is sufficient
    // (We approximate the neighborhood check since we can't read updated neighbors)
    var postMaxAlpha = 0.0;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) {
                postMaxAlpha = max(postMaxAlpha, newState[3]);
            } else {
                postMaxAlpha = max(postMaxAlpha, getCell(i32(x) + dx, i32(y) + dy, 3u));
            }
        }
    }

    let postAlive = postMaxAlpha > 0.1;

    // Write output (apply life mask)
    for (var c = 0u; c < CHANNELS; c++) {
        if (postAlive) {
            setCell(x, y, c, newState[c]);
        } else {
            setCell(x, y, c, 0.0);
        }
    }
}
