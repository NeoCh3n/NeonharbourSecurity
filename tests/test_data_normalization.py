"""Tests for data normalization utilities."""
import pytest
from collections.abc import Iterable


def normalize_iterable(records):
    """把各种可能的记录容器统一成可迭代的 list。
    对于非可迭代（如 float/None/int/str）返回空 list。"""
    if records is None:
        return []
    # dict：优先取 'items' 字段，否则遍历其 values
    if isinstance(records, dict):
        if "items" in records and isinstance(records["items"], Iterable):
            return list(records["items"])
        return list(records.values())
    # 已经是常见可迭代容器
    if isinstance(records, (list, tuple, set)):
        return list(records)
    # 字符串当作非记录处理（避免按字符遍历）
    if isinstance(records, (str, bytes)):
        return []
    # 其他（float/int/bool等）直接丢弃
    return []


class TestDataNormalization:
    """Test data normalization utilities."""
    
    def test_normalize_iterable_with_none(self):
        """Test handling of None values."""
        result = normalize_iterable(None)
        assert result == []
    
    def test_normalize_iterable_with_list(self):
        """Test handling of list values."""
        test_list = [{"id": 1}, {"id": 2}]
        result = normalize_iterable(test_list)
        assert result == test_list
    
    def test_normalize_iterable_with_tuple(self):
        """Test handling of tuple values."""
        test_tuple = ({"id": 1}, {"id": 2})
        result = normalize_iterable(test_tuple)
        assert result == [{"id": 1}, {"id": 2}]
    
    def test_normalize_iterable_with_set(self):
        """Test handling of set values."""
        test_set = {1, 2, 3}
        result = normalize_iterable(test_set)
        assert isinstance(result, list)
        assert set(result) == test_set
    
    def test_normalize_iterable_with_dict_items_field(self):
        """Test handling of dict with 'items' field."""
        test_dict = {
            "items": [{"id": 1}, {"id": 2}],
            "count": 2
        }
        result = normalize_iterable(test_dict)
        assert result == [{"id": 1}, {"id": 2}]
    
    def test_normalize_iterable_with_dict_no_items_field(self):
        """Test handling of dict without 'items' field."""
        test_dict = {
            "data1": {"id": 1},
            "data2": {"id": 2}
        }
        result = normalize_iterable(test_dict)
        assert len(result) == 2
        assert {"id": 1} in result
        assert {"id": 2} in result
    
    def test_normalize_iterable_with_string(self):
        """Test handling of string values (should return empty list)."""
        result = normalize_iterable("test_string")
        assert result == []
    
    def test_normalize_iterable_with_bytes(self):
        """Test handling of bytes values (should return empty list)."""
        result = normalize_iterable(b"test_bytes")
        assert result == []
    
    def test_normalize_iterable_with_float(self):
        """Test handling of float values (should return empty list)."""
        result = normalize_iterable(12.5)
        assert result == []
    
    def test_normalize_iterable_with_int(self):
        """Test handling of int values (should return empty list)."""
        result = normalize_iterable(42)
        assert result == []
    
    def test_normalize_iterable_with_bool(self):
        """Test handling of bool values (should return empty list)."""
        result = normalize_iterable(True)
        assert result == []
        result = normalize_iterable(False)
        assert result == []
    
    def test_normalize_iterable_with_dict_non_iterable_items(self):
        """Test handling of dict with non-iterable 'items' field."""
        test_dict = {
            "items": 42,  # Non-iterable
            "data": {"id": 1}
        }
        result = normalize_iterable(test_dict)
        # Should fall back to dict.values()
        assert len(result) == 2
        assert 42 in result
        assert {"id": 1} in result
    
    def test_normalize_iterable_edge_cases(self):
        """Test various edge cases that might cause issues."""
        # Empty containers
        assert normalize_iterable([]) == []
        assert normalize_iterable({}) == []
        assert normalize_iterable(set()) == []
        
        # Nested structures
        nested = [{"items": [1, 2]}, {"data": 3}]
        result = normalize_iterable(nested)
        assert result == nested
        
        # Mixed types in list
        mixed = [1, "string", {"id": 1}, None]
        result = normalize_iterable(mixed)
        assert result == mixed


def test_integration_with_mock_data_sources():
    """Test integration with various mock data source formats."""
    
    # Simulate different data source return formats
    mock_data_sources = {
        "normal_list": [{"risk_score": 0.1}, {"risk_score": 0.8}],
        "dict_with_items": {
            "items": [{"risk_score": 0.2}, {"risk_score": 0.9}],
            "total_count": 2
        },
        "plain_dict": {
            "event1": {"risk_score": 0.3},
            "event2": {"risk_score": 0.7}
        },
        "float_count": 12.5,  # This would cause the original error
        "string_response": "error_message",
        "none_response": None,
        "empty_list": [],
        "boolean_flag": True
    }
    
    # Process all data sources safely
    total_items = 0
    auto_closable = 0
    
    for source_name, records in mock_data_sources.items():
        iterable_records = normalize_iterable(records)
        for record in iterable_records:
            if isinstance(record, dict) and "risk_score" in record:
                total_items += 1
                if record["risk_score"] < 0.5:
                    auto_closable += 1
    
    # Verify results
    assert total_items == 6  # Should find 6 valid records
    assert auto_closable == 3  # 3 records with risk_score < 0.5
    
    # Verify no exceptions were raised
    automation_rate = (auto_closable / total_items * 100) if total_items > 0 else 0
    assert automation_rate == 50.0