import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import audit, compile_candidates, prepare_amap, schedule_verified


def evidence(name, kind, themes, aliases=None, authority=None):
    source = {"kind": kind, "title": f"{name} source", "url": f"https://example.test/{name}"}
    if authority is not None:
        source["authority"] = authority
    return {
        "name": name,
        "aliases": aliases or [],
        "themes": themes,
        "why_visit": f"了解{name}",
        "watch_for": [f"{name}现场看点"],
        "stay_minutes": 60,
        "source": source,
    }


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.brief = {"destination": "测试县", "days": 2, "interests": ["历史", "美食"]}
        self.research = {"items": [
            evidence("古城博物馆", "official", ["历史"], ["县博物馆"]),
            evidence("县博物馆", "xiaohongshu", ["历史", "文化"]),
            evidence("江滨公园", "osm", ["风景"]),
            evidence("老街小吃店", "xiaohongshu", ["美食"]),
            evidence("石桥遗址", "official", ["历史"]),
            evidence("山顶步道", "osm", ["风景"]),
        ]}

    def test_compile_deduplicates_and_keeps_amap_out(self):
        result = compile_candidates(self.brief, self.research, 4, 5)
        self.assertEqual(result["counts"], {"evidence": 6, "deduplicated": 5, "shortlisted": 5})
        self.assertEqual(result["candidates"][0]["canonical_name"], "古城博物馆")
        self.assertEqual(audit(result), [])
        self.assertTrue(all(item["verification"]["provider_poi_id"] is None for item in result["candidates"]))

    def test_prepare_amap_only_contains_shortlist_queries(self):
        shortlist = compile_candidates(self.brief, self.research, 4, 5)
        manifest = prepare_amap(shortlist)
        self.assertEqual(manifest["query_count"], 5)
        self.assertIn("禁止路线调用", manifest["policy"])
        self.assertTrue(all(query["citylimit"] for query in manifest["queries"]))

    def test_schedule_only_routes_adjacent_selected_places(self):
        candidates = []
        for index in range(10):
            candidates.append({
                "candidate_id": f"candidate-{index}",
                "canonical_name": f"地点{index}",
                "provider_poi_id": f"AMAP-{index}",
                "score": 100 - index,
                "location": {"lng": 120 + index * 0.01, "lat": 28 + index * 0.005, "coord_system": "GCJ-02"},
                "verification": {"status": "verified", "provider": "amap"},
            })
        result = schedule_verified(self.brief, {"candidates": candidates}, 5)
        self.assertEqual(result["selected_candidate_count"], 10)
        self.assertEqual(result["route_query_count"], 8)
        self.assertEqual(audit(result), [])
        self.assertTrue(all(len(day["assignments"]) == 5 for day in result["days"]))


if __name__ == "__main__":
    unittest.main()
