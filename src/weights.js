export async function loadWeights(device) {
    const response = await fetch('weights.json');
    const weights = await response.json();
    const buffers = {};

    for (const [name, data] of Object.entries(weights)) {
        const flatData = new Float32Array(data.flat(Infinity));
        const buffer = device.createBuffer({
            size: flatData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: `weight_${name}`
        });
        device.queue.writeBuffer(buffer, 0, flatData);
        buffers[name] = { buffer, shape: getShape(data), data: flatData };
    }

    return buffers;
}

function getShape(arr) {
    const shape = [];
    let current = arr;
    while (Array.isArray(current)) {
        shape.push(current.length);
        current = current[0];
    }
    return shape;
}
