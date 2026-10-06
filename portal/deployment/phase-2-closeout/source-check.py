"""Fail closed on accidental sensitive files in the publishable portal bundle."""
from pathlib import Path
import re,sys
root=Path(sys.argv[1]);count=0
for p in root.rglob('*'):
 if not p.is_file() or '.git' in p.parts:continue
 relative=p.relative_to(root)
 assert not any(x in relative.parts for x in ['checkouts','node_modules','__pycache__','.DS_Store']),str(relative)
 assert p.suffix.lower() not in ['.p12','.pfx','.key','.zip','.gz','.log'],str(relative)
 assert not p.name.startswith('.env') or p.name.endswith(('.example','.template')),str(relative)
 if p.suffix.lower() in ['.png','.jpg','.jpeg','.ico','.woff','.woff2','.ttf']:continue
 try:s=p.read_text()
 except UnicodeDecodeError:raise AssertionError('Unexpected binary: '+str(relative))
 patterns=[r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'\b(?:sk_live_|rk_live_|ghp_|gho_)[A-Za-z0-9]{15,}',r'\bAKIA[A-Z0-9]{16}\b',r'postgres(?:ql)?://[A-Za-z0-9_.-]+:[A-Za-z0-9_%!-]{16,}@']
 s=re.sub(r'postgres(?:ql)?://[^\s]+:synthetic@[^\s]+','SYNTHETIC_CONNECTION',s)
 for pattern in patterns:assert not re.search(pattern,s),'Possible secret: '+str(relative)
 count+=1
print('Publication source checks passed for',count,'text files.')
