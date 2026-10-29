# MusicXML 4.0 schemas

These unmodified schemas come from the W3C MusicXML repository, tag `v4.0`:

- https://github.com/w3c/musicxml/tree/v4.0/schema
- https://www.w3.org/2021/06/musicxml40/

The copyright and W3C Community Final Specification Agreement notices are retained in the schemas. `scripts/validate-musicxml.py` resolves schema imports locally; validation does not access the network or expand external entities.

Run `npm run test:musicxml` for mandatory schema and semantic regression checks. This command requires Python with `lxml`; set `MUSICXML_PYTHON` if needed. The regular test suite runs semantic tests everywhere and skips only the XSD checks if that runtime is unavailable.
