(function () {
    const form = document.getElementById("logo-form");
    if (!form) {
        return;
    }
    const fileInput = document.getElementById("logo-file");
    const canvas = document.getElementById("crop-canvas");
    const stage = document.getElementById("crop-stage");
    const zoom = document.getElementById("logo-zoom");
    const background = document.getElementById("logo-bg");
    const color = document.getElementById("logo-color");
    const save = document.getElementById("logo-save");
    const size = canvas.width;
    let image = null;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function fitScale() {
        return Math.min(size / image.width, size / image.height);
    }

    function drawAt(target, targetSize) {
        const context = target.getContext("2d");
        context.clearRect(0, 0, targetSize, targetSize);
        if (background.checked) {
            context.fillStyle = color.value;
            context.fillRect(0, 0, targetSize, targetSize);
        }
        if (!image) {
            return;
        }
        const scale = fitScale() * Number(zoom.value) * (targetSize / size);
        context.save();
        context.translate(targetSize / 2 + (panX * targetSize) / size, targetSize / 2 + (panY * targetSize) / size);
        context.scale(scale, scale);
        context.drawImage(image, -image.width / 2, -image.height / 2);
        context.restore();
    }

    function draw() {
        drawAt(canvas, size);
    }

    fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        image = null;
        save.disabled = true;
        if (!file) {
            stage.hidden = true;
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const next = new Image();
            next.onload = () => {
                image = next;
                panX = 0;
                panY = 0;
                zoom.value = "1";
                stage.hidden = false;
                save.disabled = false;
                draw();
            };
            next.onerror = () => {
                stage.hidden = true;
            };
            next.src = String(reader.result || "");
        };
        reader.onerror = () => {
            stage.hidden = true;
        };
        reader.readAsDataURL(file);
    });

    zoom.addEventListener("input", draw);
    background.addEventListener("change", draw);
    color.addEventListener("input", draw);

    canvas.addEventListener("pointerdown", (event) => {
        if (!image) {
            return;
        }
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
        if (!dragging) {
            return;
        }
        panX += event.clientX - lastX;
        panY += event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        draw();
    });
    function stopDrag() {
        dragging = false;
    }
    canvas.addEventListener("pointerup", stopDrag);
    canvas.addEventListener("pointercancel", stopDrag);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!image) {
            return;
        }
        const exported = document.createElement("canvas");
        exported.width = 1000;
        exported.height = 1000;
        drawAt(exported, 1000);
        exported.toBlob((blob) => {
            if (!blob) {
                return;
            }
            const body = new FormData(form);
            body.delete("source");
            body.set("logo", blob, "logo.png");
            save.disabled = true;
            fetch(form.action, {
                method: "POST",
                body: body,
                credentials: "same-origin"
            }).then((response) => {
                if (response.ok) {
                    window.location.href = response.url || "/admin/logos";
                    return;
                }
                save.disabled = false;
            }).catch(() => {
                save.disabled = false;
            });
        }, "image/png");
    });
})();
