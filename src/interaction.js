export function setupDrawing(canvas, device, storageBuffer, W, H, D, render) {
    let isDrawing = false;
    let pendingEvent = null;
    let rafId = null;
    let lastPaintedX = -1;
    let lastPaintedY = -1;

    const whiteCell = new Float32Array(D);
    whiteCell[0] = 1.0; // R
    whiteCell[1] = 1.0; // G
    whiteCell[2] = 1.0; // B

    function paintCell(event) {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / rect.width * W);
        const y = Math.floor((event.clientY - rect.top) / rect.height * H);

        if (x < 0 || x >= W || y < 0 || y >= H) return;
        if (x === lastPaintedX && y === lastPaintedY) return;

        lastPaintedX = x;
        lastPaintedY = y;

        const cellOffset = (y * W + x) * D * Float32Array.BYTES_PER_ELEMENT;
        device.queue.writeBuffer(storageBuffer, cellOffset, whiteCell);
    }

    function flushPendingPaint() {
        if (pendingEvent) {
            paintCell(pendingEvent);
            pendingEvent = null;
        }
        rafId = null;
    }

    function schedulePaint(event) {
        pendingEvent = event;
        if (!rafId) {
            rafId = requestAnimationFrame(flushPendingPaint);
        }
    }

    canvas.addEventListener('mousedown', (event) => {
        isDrawing = true;
        paintCell(event);
    });

    canvas.addEventListener('mousemove', (event) => {
        if (isDrawing) {
            schedulePaint(event);
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
        lastPaintedX = -1;
        lastPaintedY = -1;
    });

    canvas.addEventListener('mouseleave', () => {
        isDrawing = false;
        lastPaintedX = -1;
        lastPaintedY = -1;
    });
}
