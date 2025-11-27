export function setupDrawing(canvas, device, storageBuffer, W, H, D, render) {
    let isDrawing = false;

    function paintCell(event) {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / rect.width * W);
        const y = Math.floor((1 - (event.clientY - rect.top) / rect.height) * H);

        if (x < 0 || x >= W || y < 0 || y >= H) return;

        const cellOffset = (y * W + x) * D * Float32Array.BYTES_PER_ELEMENT;
        const whiteCell = new Float32Array(D);
        whiteCell[0] = 1.0; // R
        whiteCell[1] = 1.0; // G
        whiteCell[2] = 1.0; // B

        device.queue.writeBuffer(storageBuffer, cellOffset, whiteCell);
        render();
    }

    canvas.addEventListener('mousedown', (event) => {
        isDrawing = true;
        paintCell(event);
    });

    canvas.addEventListener('mousemove', (event) => {
        if (isDrawing) {
            paintCell(event);
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDrawing = false;
    });
}
