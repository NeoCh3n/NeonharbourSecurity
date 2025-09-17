from pathlib import Path

from src.compliance.generate_pack import build_compliance_pack


def test_compliance_pack_outputs(tmp_path):
    pack_dir = build_compliance_pack(tmp_path, include_archive=False)
    assert (pack_dir / "sa2_tm-g1_control_matrix.csv").exists()
    assert (pack_dir / "sa2_tm-g1_control_matrix.pdf").exists()
    assert (pack_dir / "segregation_of_duties.json").exists()
