# ロゴの白背景を透過にする補助スクリプト。
# 使い方: python3 scripts/make-logo.py <カラーロゴ入力> <出力png> <単色ロゴ入力> <出力png>
# 1つ目: 外周の白だけ透過(カラーロゴ向け) / 2つ目: 黒い部分をクリーム色に変換(黒一色ロゴ向け)
import sys
from collections import deque
from PIL import Image
def bg_remove(src,dst,tol=40):
    im=Image.open(src).convert('RGBA');w,h=im.size;px=im.load()
    seen=bytearray(w*h);q=deque()
    for x in range(w):q+= [(x,0),(x,h-1)]
    for y in range(h):q+= [(0,y),(w-1,y)]
    while q:
        x,y=q.popleft()
        if x<0 or y<0 or x>=w or y>=h or seen[y*w+x]:continue
        seen[y*w+x]=1;r,g,b,a=px[x,y]
        if min(r,g,b)<255-tol:continue
        px[x,y]=(r,g,b,0);q+=[(x+1,y),(x-1,y),(x,y+1),(x,y-1)]
    im=im.crop(im.getbbox());im.thumbnail((600,600));im.save(dst,optimize=True)
def mono(src,dst,color=(236,232,225)):
    im=Image.open(src).convert('L');a=im.point(lambda v:255-v)
    out=Image.new('RGBA',im.size,color+(0,));out.putalpha(a)
    out=out.crop(a.getbbox());out.thumbnail((600,600));out.save(dst,optimize=True)
bg_remove(sys.argv[1],sys.argv[2]);mono(sys.argv[3],sys.argv[4])
