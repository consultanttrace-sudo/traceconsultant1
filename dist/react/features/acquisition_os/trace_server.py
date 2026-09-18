#!/usr/bin/env python3
import json, os, sys, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get('TRACE_PORT', '8765'))
OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


    def do_POST(self):
        if self.path == '/api/social-intel':
            length = int(self.headers.get('Content-Length', '0'))
            try:
                payload=json.loads(self.rfile.read(length) or '{}')
                lead=payload.get('lead') or {}
                urls=[]
                if lead.get('website','').startswith(('http://','https://')): urls.append(('website',lead['website']))
                handle=str(lead.get('instagram') or '').lstrip('@').strip()
                if handle and all(c.isalnum() or c in '._-' for c in handle): urls.append(('instagram',f'https://www.instagram.com/{handle}/'))
                docs=[]
                import re, html as htmlmod
                for typ,url in urls[:2]:
                    try:
                        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 TRACE-Acquisition-OS/1.0'})
                        with urllib.request.urlopen(req,timeout=15) as r:
                            raw=r.read(800000).decode('utf-8','ignore'); status=getattr(r,'status',200)
                        def meta(name):
                            m=re.search(r'<meta[^>]+(?:property|name)=[\"\']'+re.escape(name)+r'[\"\'][^>]+content=[\"\']([^\"\']*)[\"\']',raw,re.I)
                            return htmlmod.unescape(m.group(1)) if m else None
                        title=meta('og:title') or meta('twitter:title')
                        desc=meta('og:description') or meta('description') or meta('twitter:description')
                        docs.append({'type':typ,'url':url,'status':status,'title':title,'description':desc,'text':' '.join(x for x in [title,desc] if x)[:2000]})
                    except Exception as e: docs.append({'type':typ,'url':url,'error':str(e)})
                combined=' '.join(d.get('text') or '' for d in docs).lower()
                def hits(words): return [w for w in words if w in combined]
                promo=hits(['promo','discount','diskon','voucher','order','delivery','reservasi','booking'])
                community=hits(['community','event','music','workshop','space'])
                premium=hits(['specialty','artisan','premium','signature','roastery'])
                ig=bool(lead.get('instagram') and lead.get('instagram') not in ('Unknown','Not Found'))
                rating=float(lead.get('rating') or 0); reviews=int(lead.get('review_count') or 0); outlets=int(lead.get('outlet_count') or 0)
                brand=min(100,45+(20 if ig else 0)+(10 if lead.get('website') not in (None,'','Unknown','Not Found') else 0)+(10 if rating>=4.5 else 0))
                content=min(100,40+(20 if ig else 0)+(10 if community else 0)+(10 if premium else 0))
                reach=min(100,40+(20 if ig else 0)+(15 if reviews>=500 else 0)+(10 if rating>=4.5 else 0)+(10 if outlets>1 else 0))
                conversion=min(100,35+(15 if promo else 0)+(15 if lead.get('website') not in (None,'','Unknown','Not Found') else 0)+(10 if reviews>=500 else 0))
                angle='Social Media Growth / Reach' if ig and reach>=70 else ('Content-to-Conversion' if conversion>=65 else ('Operational Scaling + Profitability' if outlets>1 else 'Business & Profitability Insight'))
                signals=[]
                if ig: signals.append({'signal':'Instagram profile identified','type':'fact','detail':'Profil Instagram tersedia dari sumber publik/website.'})
                if any(d.get('type')=='instagram' and d.get('status',0)>=200 and d.get('status',0)<400 for d in docs): signals.append({'signal':'Public Instagram page reachable','type':'fact','detail':'Halaman publik Instagram dapat diakses saat pengecekan.'})
                if promo: signals.append({'signal':'Offer / CTA language detected','type':'fact','detail':'Tema CTA: '+', '.join(promo)+'.'})
                if community: signals.append({'signal':'Community/event signal','type':'fact','detail':'Tema: '+', '.join(community)+'.'})
                result={'status': 'auto_public_data' if ig else 'limited_public_data','instagram':lead.get('instagram') or None,'source_note':'Analisis otomatis dari data bisnis + sumber publik/social yang dapat diakses. Sistem tidak membutuhkan screenshot dan tidak mengklaim observasi feed pixel-level.' if ig else 'Instagram belum terverifikasi; sistem memakai business/website signals dan tidak mengarang isi feed.','public_pages':docs,'signals':signals,'metrics':{'brand_presence':brand,'content_opportunity':content,'reach_opportunity':reach,'conversion_opportunity':conversion},'detected_themes':{'promo':promo,'community':community,'premium':premium},'primary_opportunity':'Peluang utama yang perlu diuji: '+angle+'.','recommended_sales_angle':angle,'dm_hook':f'Saya sempat melihat presence digital {lead.get("business_name","bisnis ini")}; ada satu peluang yang menurut saya menarik dari sisi {angle.lower()}.','analyzed_at':__import__('datetime').datetime.utcnow().isoformat()+'Z'}
                body=json.dumps(result).encode(); self.send_response(200); self.send_header('Content-Type','application/json; charset=utf-8'); self.end_headers(); self.wfile.write(body); return
            except Exception as e:
                body=json.dumps({'error':str(e)}).encode(); self.send_response(400); self.send_header('Content-Type','application/json; charset=utf-8'); self.end_headers(); self.wfile.write(body); return
        if self.path == '/api/social-enrich':
            length = int(self.headers.get('Content-Length', '0'))
            try:
                payload = json.loads(self.rfile.read(length) or '{}')
                results=[]
                for item in (payload.get('websites') or [])[:40]:
                    website=item.get('website','')
                    ig=None
                    try:
                        req=urllib.request.Request(website,headers={'User-Agent':'TRACE-Acquisition-OS/1.0'})
                        with urllib.request.urlopen(req,timeout=12) as r:
                            html=r.read(500000).decode('utf-8','ignore')
                        import re
                        m=re.search(r'https?://(?:www\.)?instagram\.com/([A-Za-z0-9_.-]+)',html,re.I)
                        if m and m.group(1) not in ('p','reel','reels','explore','accounts'): ig='@'+m.group(1)
                    except Exception:
                        pass
                    results.append({'external_id':item.get('external_id'),'instagram':ig})
                body=json.dumps({'results':results}).encode()
                self.send_response(200); self.send_header('Content-Type','application/json; charset=utf-8'); self.end_headers(); self.wfile.write(body); return
            except Exception as e:
                body=json.dumps({'error':str(e)}).encode(); self.send_response(400); self.send_header('Content-Type','application/json; charset=utf-8'); self.end_headers(); self.wfile.write(body); return
        if self.path != '/api/overpass':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', '0'))
        query = self.rfile.read(length)
        last = None
        for url in OVERPASS:
            try:
                req = urllib.request.Request(url, data=query, headers={'Content-Type':'text/plain','User-Agent':'TRACE-Acquisition-OS/1.0'}, method='POST')
                with urllib.request.urlopen(req, timeout=65) as r:
                    body = r.read()
                    self.send_response(200)
                    self.send_header('Content-Type','application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(body)
                    return
            except Exception as e:
                last = e
        payload = json.dumps({'error':'All Overpass providers failed','detail':str(last)}).encode()
        self.send_response(502)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        print('[TRACE]', fmt % args)

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'TRACE Acquisition OS running at http://127.0.0.1:{PORT}/index.html')
    server.serve_forever()
