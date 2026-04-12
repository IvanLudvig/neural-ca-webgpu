import { setupDrawing } from './interaction.js';
import { loadWeights } from './weights.js';

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
if (!device) {
    window.alert('WebGPU not supported');
    throw new Error('WebGPU not supported');
}

const weights = await loadWeights(device);

const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format: canvasFormat });

const H = 40;
const W = 40;
const D = 16;

const bufferSize = H * W * D * Float32Array.BYTES_PER_ELEMENT;
const stateBuffers = [
    device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
];

const imageData = new Float32Array(H * W * D);
const centerX = Math.floor(W / 2);
const centerY = Math.floor(H / 2);
const seedId = (centerY * W + centerX) * D;

// Initialize seed: RGB=0, Alpha and hidden channels (3-15)=1
for (let c = 3; c < D; c++) {
    imageData[seedId + c] = 1.0;
}

device.queue.writeBuffer(stateBuffers[0], 0, imageData);
device.queue.writeBuffer(stateBuffers[1], 0, new Float32Array(H * W * D));

const renderShaderModule = device.createShaderModule({
    code: await fetch('src/shaders/render.wgsl').then(r => r.text())
});

const ncaShaderModule = device.createShaderModule({
    code: await fetch('src/shaders/nca.wgsl').then(r => r.text())
});

const seedBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ]
});

const computeBindGroups = [
    device.createBindGroup({
        layout: computeBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: stateBuffers[0] } },
            { binding: 1, resource: { buffer: stateBuffers[1] } },
            { binding: 2, resource: { buffer: weights['fc0.weight'].buffer } },
            { binding: 3, resource: { buffer: weights['fc0.bias'].buffer } },
            { binding: 4, resource: { buffer: weights['fc1.weight'].buffer } },
            { binding: 5, resource: { buffer: seedBuffer } },
        ]
    }),
    device.createBindGroup({
        layout: computeBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: stateBuffers[1] } },
            { binding: 1, resource: { buffer: stateBuffers[0] } },
            { binding: 2, resource: { buffer: weights['fc0.weight'].buffer } },
            { binding: 3, resource: { buffer: weights['fc0.bias'].buffer } },
            { binding: 4, resource: { buffer: weights['fc1.weight'].buffer } },
            { binding: 5, resource: { buffer: seedBuffer } },
        ]
    })
];

const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
        bindGroupLayouts: [computeBindGroupLayout]
    }),
    compute: {
        module: ncaShaderModule,
        entryPoint: 'main'
    }
});

const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' }
    }]
});

const renderBindGroups = [
    device.createBindGroup({
        layout: renderBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: stateBuffers[0] } }]
    }),
    device.createBindGroup({
        layout: renderBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: stateBuffers[1] } }]
    })
];

const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
        bindGroupLayouts: [renderBindGroupLayout]
    }),
    vertex: {
        module: renderShaderModule,
    },
    fragment: {
        module: renderShaderModule,
        targets: [{
            format: canvasFormat
        }]
    },
});

let step = 0;
const seedData = new Uint32Array([0]);

function update() {
    const currentBuffer = step % 2;
    const nextBuffer = (step + 1) % 2;

    seedData[0] = step;
    device.queue.writeBuffer(seedBuffer, 0, seedData);

    const encoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroups[currentBuffer]);
    computePass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8));
    computePass.end();

    const renderPass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
            storeOp: 'store'
        }]
    });

    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroups[nextBuffer]);
    renderPass.draw(6, H * W);
    renderPass.end();

    device.queue.submit([encoder.finish()]);

    step++;
}

function loop() {
    update();
    requestAnimationFrame(loop);
}

loop();
setupDrawing(canvas, device, stateBuffers[0], W, H, D, update);
