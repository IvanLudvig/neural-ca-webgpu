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
const storageBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

const imageData = new Float32Array(H * W * D);
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const id = (y * W + x) * D;
        imageData[id] = x / W;     // R
        imageData[id + 1] = y / H; // G
        imageData[id + 2] = 0.5;   // B
    }
}

device.queue.writeBuffer(storageBuffer, 0, imageData);

const shaderModule = device.createShaderModule({
    code: await fetch('src/shaders/render.wgsl').then(r => r.text())
});

const bindGroupLayout = device.createBindGroupLayout({
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'read-only-storage' }
    }]
});

const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{
        binding: 0,
        resource: { buffer: storageBuffer }
    }]
});

const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
    }),
    vertex: {
        module: shaderModule,
    },
    fragment: {
        module: shaderModule,
        targets: [{
            format: canvasFormat
        }]
    },
});

function render() {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            storeOp: 'store'
        }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, H * W); // 6 vertices, H*W instances
    pass.end();

    device.queue.submit([encoder.finish()]);
}

render();
setupDrawing(canvas, device, storageBuffer, W, H, D, render);
