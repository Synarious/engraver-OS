"""Offline MusicXML 4.0 XSD validation. Requires lxml (bundled with Codex)."""
from pathlib import Path
import sys
from lxml import etree

schema_root = Path(__file__).resolve().parent.parent / "tests/fixtures/musicxml-schema"

class LocalSchemas(etree.Resolver):
    def resolve(self, url, public_id, context):
        name = url.replace("\\", "/").rsplit("/", 1)[-1]
        if name in ("xml.xsd", "xlink.xsd", "musicxml.xsd"):
            return self.resolve_filename(str(schema_root / name), context)
        raise ValueError(f"External schema or entity is not allowed: {url}")

parser = etree.XMLParser(no_network=True, resolve_entities=False, load_dtd=False)
parser.resolvers.add(LocalSchemas())
schema = etree.XMLSchema(etree.parse(str(schema_root / "musicxml.xsd"), parser))
source = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else sys.stdin.buffer.read()
document = etree.fromstring(source, etree.XMLParser(no_network=True, resolve_entities=False, load_dtd=False))
if not schema.validate(document):
    print(schema.error_log, file=sys.stderr)
    sys.exit(1)
print("MusicXML 4.0 schema valid")
