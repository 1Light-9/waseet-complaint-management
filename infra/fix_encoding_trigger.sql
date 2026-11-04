CREATE OR REPLACE FUNCTION fix_chunk_content_encoding()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content := convert_from(NEW.content::bytea, 'UTF8');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fix_chunk_encoding ON document_chunks;

CREATE TRIGGER trg_fix_chunk_encoding
BEFORE INSERT OR UPDATE OF content ON document_chunks
FOR EACH ROW EXECUTE FUNCTION fix_chunk_content_encoding();
