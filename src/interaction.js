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

    const radius = 2;
    const radiusSq = radius * radius;

    function paintCell(event) {
        const rect = canvas.getBoundingClientRect();
        const cx = Math.floor((event.clientX - rect.left) / rect.width * W);
        const cy = Math.floor((event.clientY - rect.top) / rect.height * H);

        if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;
        if (cx === lastPaintedX && cy === lastPaintedY) return;

        lastPaintedX = cx;
        lastPaintedY = cy;

        // paint cells inside circular brush
        const rInt = Math.ceil(radius);
        for (let dy = -rInt; dy <= rInt; dy++) {
            const y = cy + dy;
            if (y < 0 || y >= H) continue;
            for (let dx = -rInt; dx <= rInt; dx++) {
                const x = cx + dx;
                if (x < 0 || x >= W) continue;
                if ((dx * dx + dy * dy) > radiusSq) continue;

                const cellOffset = (y * W + x) * D * Float32Array.BYTES_PER_ELEMENT;
                device.queue.writeBuffer(storageBuffer, cellOffset, whiteCell);
            }
        }
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

    function stopDrawing() {
        isDrawing = false;
        lastPaintedX = -1;
        lastPaintedY = -1;
    }

    canvas.addEventListener('mousedown', (e) => { isDrawing = true; paintCell(e); });
    canvas.addEventListener('mousemove', (e) => { if (isDrawing) schedulePaint(e); });
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); isDrawing = true; paintCell(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (isDrawing) schedulePaint(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
}
