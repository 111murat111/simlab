#!/bin/sh
# kullanım: dev/zoom.sh in.png out.png x y w h [ölçek]
ffmpeg -loglevel error -y -i "$1" -vf "crop=$5:$6:$3:$4,scale=iw*${7:-4}:ih*${7:-4}:flags=neighbor" "$2"
