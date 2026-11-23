"""Rebuild the original field-guide cover: python -m pip install Pillow; python tools/cover.py."""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw

r = random.Random(114)
w, h = 920, 310
img = Image.new("RGB", (w, h))
d = ImageDraw.Draw(img)


def mix(a, b, t):
    return tuple(int(i + (j-i)*t) for i, j in zip(a, b))


for y in range(h):
    d.line((0, y, w, y), fill=mix((109, 177, 192), (222, 229, 185), min(1, y/175)))
d.rectangle((707, 28, 738, 59), fill="#fff1bc")
for x, y, size in [(26, 36, 82), (170, 62, 60), (298, 19, 85), (505, 40, 73), (635, 9, 45), (804, 55, 81)]:
    for a, b, c, e in [(0, 8, size, 13), (12, 3, size-12, 10), (23, 0, size-22, 6)]:
        d.rectangle((x+a, y+b, x+c, y+e), fill="#f3edcf")
    d.rectangle((x+8, y+14, x+size-8, y+16), fill="#c8d8c2")
for layer, (base, amp, color) in enumerate([(81,23,"#94b9aa"),(105,32,"#86aa98"),(132,47,"#699580")]):
    for x in range(0,w,4):
        elev = .43*math.sin(x*.017+layer)+.37*math.cos(x*.033-layer*3)+.14*math.sin(x*.082+layer)+.09*math.cos(x*.251)
        y=round((base-amp*elev)/3)*3
        d.rectangle((x,y,x+3,h),fill=color)


def height(x,z):
    u=(x-z)*5+455
    depth=x+z
    valley=math.exp(-((u-450-70*math.sin(depth*.051))/120)**2)
    a=2.2*math.sin(x*.22)+2.9*math.cos(z*.16)+1.3*math.sin(z*.35+x*.18)
    hill=10*math.exp(-((u-722)/135)**2-((depth-14)/25)**2)
    hill+=9*math.exp(-((u-95)/190)**2-((depth+14)/32)**2)
    mesa=math.exp(-((u-680)/125)**4-((depth-20)/17)**4)
    return math.floor(a+hill+3-7*valley+9*mesa)


def tint(c, k, fog):
    return mix(tuple(max(0,min(255,int(v*k))) for v in c), (152,184,154),fog)


def box(u,v,s,dy,colors):
    a,b,c=colors
    d.polygon([(u-s,v),(u,v+s*.45),(u,v+s*.45+dy),(u-s,v+dy)],fill=b)
    d.polygon([(u+s,v),(u,v+s*.45),(u,v+s*.45+dy),(u+s,v+dy)],fill=c)
    d.polygon([(u-s,v),(u,v-s*.45),(u+s,v),(u,v+s*.45)],fill=a)


objects=[]
for depth in range(-64,80):
    perspective=88/(110-depth)
    for delta in range(-int(100/perspective)-4,int(100/perspective)+5):
        if (delta+depth)%2: continue
        x,z=(depth+delta)//2,(depth-delta)//2
        u=delta*5*perspective+455
        v=67+162*perspective
        y=height(x,z)
        fog=max(0,min(.82,(-depth+26)/107))
        green=(163,181,75) if y>4 else (133,164,78)
        def drawtile(u=u,v=v,y=y,fog=fog,green=green,x=x,z=z,s=perspective):
            k=r.uniform(.94,1.05)
            top=v-y*4*s
            def project(a,b,elev):
                sc=88/(110-a-b)
                return (round((a-b)*5*sc+455),round(67+(162-elev*4)*sc))
            a,b,c,f=[project(xx,zz,y) for xx,zz in [(x-.5,z-.5),(x+.5,z-.5),(x+.5,z+.5),(x-.5,z+.5)]]
            for near,edge,coords,base in [(height(x+1,z),b,(x+.5,z-.5),(104,86,58)),(height(x,z+1),f,(x-.5,z+.5),(155,118,74))]:
                last1,last2=edge,c
                for elev in range(y-1,near-1,-1):
                    p1,p2=project(*coords,elev),project(x+.5,z+.5,elev)
                    shade=base if y-elev<=3 else (139,136,115)
                    d.polygon([last1,last2,p2,p1],fill=tint(shade,k*(.94+.06*((elev+x+z)%2)),fog))
                    last1,last2=p1,p2
            d.polygon([a,b,c,f],fill=tint(green,k,fog))
            if r.random()<.16: d.point((u+1,top),fill=tint((199,196,92),k,fog))
        objects.append((depth,drawtile))
        if y>0 and r.random()<.023 and u> -20 and u<w+20:
            tree=r.choice([.74,.9,1,1.2])
            def drawtree(u=u,v=v-y*4*perspective,fog=fog,s=tree*perspective):
                box(u,v-16*s,2.6*s,16*s,[tint(c,1,fog) for c in [(109,93,57),(104,78,48),(76,69,44)]])
                for off,wide,thick in [(20,12,7),(28,10,7),(34,6,5)]:
                    k=r.uniform(.9,1.09)
                    colors=[tint(c,k,fog) for c in [(112,150,67),(75,119,65),(55,99,61)]]
                    box(u,v-off*s,wide*s,thick*s,colors)
                    for _ in range(int(wide*.65)):
                        dx=r.uniform(-wide*.77,wide*.77)*s
                        yy=v-off*s+r.uniform(-1,1)*s
                        d.rectangle((u+dx,yy,u+dx+1,yy+1),fill=tint((134,161,75),k,fog))
            objects.append((depth+1.8,drawtree))
def oak(x,z):
    depth=x+z
    s=88/(110-depth)
    u=(x-z)*5*s+455
    ground=67+(162-height(x,z)*4)*s
    def paint():
        box(u,ground-37*s,4*s,37*s,["#b99b65","#8a6745","#664f3a"])
        for offset,rise,radius,thick in [(-10,37,17,14),(12,41,17,13),(-1,51,22,14),(1,60,15,9)]:
            cx=u+offset*s
            cy=ground-rise*s
            size=radius*s
            box(cx,cy,size,thick*s,["#95b662","#668c4f","#4d774a"])
            for _ in range(radius*2):
                dx=r.uniform(-.9,.9)*size
                dy=r.uniform(-1,1)*(size-abs(dx))*.4
                d.rectangle((cx+dx,cy+dy,cx+dx+r.randint(1,3),cy+dy+1),fill=r.choice(["#a4bf6c","#89a958"]))
            for _ in range(radius):
                dx=r.uniform(.1,.9)*size
                dy=r.uniform(1,thick*s-2)+(size-dx)*.45
                d.rectangle((cx+dx,cy+dy,cx+dx+2,cy+dy+1),fill="#5c834c")
    objects.append((depth+1.9,paint))

oak(45,-18)
oak(43,-21)
for _,draw in sorted(objects,key=lambda obj:obj[0]): draw()
Path("public").mkdir(exist_ok=True)
img.save("public/overworld.png",optimize=True)
