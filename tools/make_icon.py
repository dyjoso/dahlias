"""Draws the ball-dahlia app icon. Usage: python tools/make_icon.py out.png -1  (then resize into icons/)."""
from PIL import Image, ImageDraw, ImageFilter
import math, sys
def render(out, N=130, cup_dir=1, petal=0.17, S=1024, SS=3):
    W=S*SS; cx=cy=W/2; R=400*SS
    BG=(250,240,236); OUT=(150,16,72); MID=(214,51,118); IN=(250,184,208)
    lerp=lambda a,b,t: tuple(int(a[i]+(b[i]-a[i])*max(0,min(1,t))) for i in range(3))
    grad=lambda t: lerp(IN,MID,t/0.5) if t<0.5 else lerp(MID,OUT,(t-0.5)/0.5)
    shade=lambda c,f: tuple(max(0,min(255,int(v*f))) for v in c)
    def ell(d,x,y,a,b,ang,fill):
        ca,sa=math.cos(ang),math.sin(ang)
        d.polygon([(x+a*math.cos(k)*ca-b*math.sin(k)*sa, y+a*math.cos(k)*sa+b*math.sin(k)*ca) for k in [j*2*math.pi/64 for j in range(64)]],fill=fill)
    img=Image.new('RGB',(W,W),BG)
    sh=Image.new('L',(W,W),0); ImageDraw.Draw(sh).ellipse([cx-R*0.9,cy+R*0.25,cx+R*0.9,cy+R*1.12],fill=60)
    sh=sh.filter(ImageFilter.GaussianBlur(45*SS))
    img=Image.composite(Image.new('RGB',(W,W),(215,180,190)),img,sh)
    d=ImageDraw.Draw(img)
    d.ellipse([cx-R*0.93,cy-R*0.93,cx+R*0.93,cy+R*0.93],fill=shade(OUT,0.55))
    GA=math.pi*(3-math.sqrt(5)); fl=[]
    for i in range(N):
        t=math.sqrt((i+0.5)/N); fl.append((t,t*R*0.9,i*GA))
    for t,r,th in sorted(fl,key=lambda f:-f[0]):
        x=cx+r*math.cos(th); y=cy+r*math.sin(th)
        fore=math.sqrt(max(0.05,1-(t*0.93)**2))
        s=R*petal*(0.75+0.25*t)
        a=s; b=s*(0.45+0.55*fore)
        ang=th+math.pi/2
        lx,ly=(x-cx)/R,(y-cy)/R
        light=1.1-0.3*max(0,(lx+ly)/1.4)
        base=shade(grad(t),light)
        ell(d,x,y,a,b,ang,shade(base,0.8))              # petal outline / depth
        ell(d,x-math.cos(th)*b*0.06,y-math.sin(th)*b*0.06,a*0.92,b*0.9,ang,base)
        off=cup_dir*b*0.2
        ell(d,x+math.cos(th)*off,y+math.sin(th)*off,a*0.58,b*0.48,ang,shade(base,0.7))  # cup
    for k,f in enumerate([0.07,0.045,0.025]):
        rr=R*f; d.ellipse([cx-rr,cy-rr,cx+rr,cy+rr],fill=shade(IN,[0.95,0.8,0.9][k]))
    img.resize((S,S),Image.LANCZOS).save(out)
if __name__=='__main__':
    render(sys.argv[1], cup_dir=int(sys.argv[2]))
