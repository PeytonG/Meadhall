// SPDX-License-Identifier: AGPL-3.0-only
// An image that stops moving when motion is reduced: an animated GIF/WebP is shown as its first frame (drawn on a
// canvas, which keeps the img's sizing and object-fit), otherwise a normal <img>.
import React, { useEffect, useRef } from "react";

import { useReducedMotion } from "../theme/motion";

type MotionImageProps = React.ImgHTMLAttributes<HTMLImageElement> & { src: string };

export function MotionImage({ src, className, style, alt = "", ...rest }: MotionImageProps): React.ReactElement {
    const reduced = useReducedMotion();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!reduced) return undefined;
        let cancelled = false;
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
            const canvas = canvasRef.current;
            if (cancelled || !canvas) return;
            canvas.width = image.naturalWidth || 1;
            canvas.height = image.naturalHeight || 1;
            canvas.getContext("2d")?.drawImage(image, 0, 0);
        };
        image.src = src;
        return () => {
            cancelled = true;
        };
    }, [reduced, src]);

    if (reduced) {
        return <canvas ref={canvasRef} className={className} style={style} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} data-still="true" />;
    }
    return <img src={src} className={className} style={style} alt={alt} {...rest} />;
}
