// Package main is a small test program for WebP encoding.
package main

import (
	"bytes"
	"fmt"
	"github.com/chai2010/webp"
	"image"
	"image/draw"
)

func main() {
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	draw.Draw(img, img.Bounds(), image.White, image.Point{}, draw.Src)
	buf := bytes.NewBuffer(nil)
	err := webp.Encode(buf, img, &webp.Options{Quality: 70})
	if err != nil {
		fmt.Printf("WebP Encode Failed: %v\n", err)
	} else {
		fmt.Printf("WebP Encode Succeeded: %d bytes\n", buf.Len())
	}
}
