"""Shared fixtures for Botillo tests."""
import json
import os
import tempfile
import pytest


@pytest.fixture
def tmp_db_dir():
    """Create a temporary directory for test JSON files."""
    with tempfile.TemporaryDirectory() as d:
        yield d


@pytest.fixture
def bitcoin_file(tmp_db_dir):
    """Path to a test bitcoin.json file."""
    return os.path.join(tmp_db_dir, "bitcoin.json")


@pytest.fixture
def prodillos_file(tmp_db_dir):
    """Path to a test prodillos.json file."""
    return os.path.join(tmp_db_dir, "prodillos.json")


@pytest.fixture
def trofeillos_file(tmp_db_dir):
    """Path to a test trofeillos.json file."""
    return os.path.join(tmp_db_dir, "trofeillos.json")


@pytest.fixture
def sample_bitcoin_data():
    """Sample bitcoin price tracker data."""
    return {
        "bitcoinATH": 109000,
        "dailyMax": 108500,
        "dailyMin": 107000,
        "bitcoinMax": 108800,
        "bitcoinMaxBlock": 890000,
    }


@pytest.fixture
def sample_prodillos():
    """Sample prodillos prediction data."""
    return {
        "users": {
            "123": {"user": "Alice", "predict": 110000},
            "456": {"user": "Bob", "predict": 105000},
            "789": {"user": "Charlie", "predict": 108500},
        },
        "treasury": 1000,
    }


@pytest.fixture
def sample_trofeillos():
    """Sample trofeillos champion data."""
    return {
        "currentChampion": "Alice",
        "currentChampionId": "123",
        "123": {
            "champion": "Alice",
            "trofeillos profesionales": ["🏆 [890000]"],
        },
    }


def write_json(path, data):
    """Helper to write JSON to a file."""
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def read_json(path):
    """Helper to read JSON from a file."""
    with open(path) as f:
        return json.load(f)
