import heapq
from collections import defaultdict, deque

from apps.notes.models import Note, NoteLink
from apps.notes.services.notes import visible_notes_q

MAX_PATH_DEPTH = 20
MAX_PATH_NODES = 200


def _make_real_node(note: Note, depth: int, is_root: bool = False) -> dict:
    return {
        "key": f"note:{note.id}",
        "id": note.id,
        "title": note.title,
        "slug": note.slug,
        "author_username": note.author.username,
        "status": "ok",
        "depth": depth,
        "is_root": is_root,
    }


def _make_private_node(note_id: int, depth: int) -> dict:
    return {
        "key": f"private:{note_id}",
        "id": None,
        "title": "Private note",
        "slug": None,
        "author_username": None,
        "status": "private",
        "depth": depth,
        "is_root": False,
    }


def _make_missing_node(target_ref: str, depth: int) -> dict:
    return {
        "key": f"missing:{target_ref.lower()}",
        "id": None,
        "title": target_ref,
        "slug": None,
        "author_username": None,
        "status": "missing",
        "depth": depth,
        "is_root": False,
    }


def get_direct_prerequisites(note: Note, viewer) -> list[dict]:
    """Return direct prerequisite links for the 'Read first' block, filtered for viewer."""
    links = list(
        NoteLink.objects.filter(source=note, link_type="prereq")
        .select_related("target", "target__author")
        .order_by("id")
    )
    if not links:
        return []

    target_ids = [nl.target_id for nl in links if nl.target_id is not None]
    visible_ids = (
        set(
            Note.objects.filter(visible_notes_q(viewer))
            .filter(id__in=target_ids)
            .values_list("id", flat=True)
        )
        if target_ids
        else set()
    )

    results: list[dict] = []
    seen_keys: set[str] = set()
    for nl in links:
        if nl.target_id is None:
            node = _make_missing_node(nl.target_ref, depth=1)
        elif nl.target_id in visible_ids:
            node = _make_real_node(nl.target, depth=1)
        else:
            node = _make_private_node(nl.target_id, depth=1)

        if node["key"] not in seen_keys:
            seen_keys.add(node["key"])
            results.append(node)

    return results


def _find_cycle_warning(
    remaining_keys: set[str],
    prereq_adj: dict[str, list[str]],
    nodes: dict[str, dict],
) -> str:
    """Find a concrete cycle among remaining nodes using DFS and format a warning."""
    state: dict[str, int] = {}  # 0=unvisited, 1=visiting, 2=done
    parent: dict[str, str] = {}

    def dfs(u: str) -> list[str] | None:
        state[u] = 1
        for v in prereq_adj.get(u, []):
            if v not in remaining_keys:
                continue
            if state.get(v, 0) == 1:
                # Reconstruct cycle u -> ... -> v -> u (or v -> ... -> u -> v)
                cycle = [v, u]
                curr = u
                while curr != v and curr in parent:
                    curr = parent[curr]
                    cycle.append(curr)
                cycle.reverse()
                return cycle
            if state.get(v, 0) == 0:
                parent[v] = u
                found = dfs(v)
                if found:
                    return found
        state[u] = 2
        return None

    for key in sorted(remaining_keys):
        if state.get(key, 0) == 0:
            cycle_keys = dfs(key)
            if cycle_keys:
                titles = [nodes[k]["title"] for k in cycle_keys]
                return "Cycle detected: " + " → ".join(titles)

    return "Cycle detected in prerequisite links."


def build_reading_path(
    root_note: Note,
    viewer,
    max_depth: int = MAX_PATH_DEPTH,
    max_nodes: int = MAX_PATH_NODES,
) -> dict:
    """Build deterministic topological reading path ending at `root_note`.

    1. BFS from root_note along link_type='prereq' (batched per level).
    2. Private/missing targets become placeholder nodes and are not expanded.
    3. Kahn's topological sort with alphabetical tie-break so prerequisites come first.
    4. Detects cycles and returns warnings.
    """
    root_key = f"note:{root_note.id}"
    nodes: dict[str, dict] = {
        root_key: _make_real_node(root_note, depth=0, is_root=True)
    }

    # prereq_adj[source_key] = [target_key, ...]  (source requires target)
    prereq_adj: dict[str, list[str]] = defaultdict(list)
    # depend_adj[target_key] = [source_key, ...]  (target must come before source)
    depend_adj: dict[str, list[str]] = defaultdict(list)
    edges_seen: set[tuple[str, str]] = set()
    warnings: list[str] = []
    limit_hit = False

    frontier: deque[tuple[int, int]] = deque([(root_note.id, 0)])
    expanded_note_ids: set[int] = {root_note.id}

    while frontier:
        # Process one BFS depth level at a time in batches
        current_depth = frontier[0][1]
        if current_depth >= max_depth:
            if frontier:
                limit_hit = True
            break

        level_ids: list[int] = []
        while frontier and frontier[0][1] == current_depth:
            nid, _ = frontier.popleft()
            level_ids.append(nid)

        links = list(
            NoteLink.objects.filter(source_id__in=level_ids, link_type="prereq")
            .select_related("target", "target__author")
            .order_by("id")
        )
        if not links:
            continue

        target_ids = list({nl.target_id for nl in links if nl.target_id is not None})
        visible_ids = (
            set(
                Note.objects.filter(visible_notes_q(viewer))
                .filter(id__in=target_ids)
                .values_list("id", flat=True)
            )
            if target_ids
            else set()
        )

        for nl in links:
            src_key = f"note:{nl.source_id}"
            next_depth = current_depth + 1

            if nl.target_id is None:
                tgt_key = f"missing:{nl.target_ref.lower()}"
                if tgt_key not in nodes:
                    if len(nodes) >= max_nodes:
                        limit_hit = True
                        continue
                    nodes[tgt_key] = _make_missing_node(nl.target_ref, depth=next_depth)
            elif nl.target_id in visible_ids:
                tgt_key = f"note:{nl.target_id}"
                if tgt_key not in nodes:
                    if len(nodes) >= max_nodes:
                        limit_hit = True
                        continue
                    nodes[tgt_key] = _make_real_node(nl.target, depth=next_depth)
                    if nl.target_id not in expanded_note_ids:
                        expanded_note_ids.add(nl.target_id)
                        frontier.append((nl.target_id, next_depth))
            else:
                tgt_key = f"private:{nl.target_id}"
                if tgt_key not in nodes:
                    if len(nodes) >= max_nodes:
                        limit_hit = True
                        continue
                    nodes[tgt_key] = _make_private_node(nl.target_id, depth=next_depth)

            # Record edge: src requires tgt => tgt precedes src
            if (src_key, tgt_key) not in edges_seen:
                edges_seen.add((src_key, tgt_key))
                prereq_adj[src_key].append(tgt_key)
                depend_adj[tgt_key].append(src_key)

    if limit_hit:
        warnings.append(
            f"Reading path truncated at limit (max depth {max_depth}, max {max_nodes} nodes)."
        )

    # Kahn's topological sort on depend_adj (prereq -> dependent)
    in_degree: dict[str, int] = dict.fromkeys(nodes, 0)
    for src_key, tgt_list in prereq_adj.items():
        in_degree[src_key] = len(tgt_list)

    # Heap items: (is_root_flag, title.lower(), key) so root goes last on ties,
    # and all other ties break alphabetically by title.
    heap: list[tuple[int, str, str]] = []
    for key, deg in in_degree.items():
        if deg == 0:
            node = nodes[key]
            heapq.heappush(heap, (1 if node["is_root"] else 0, node["title"].lower(), key))

    ordered_steps: list[dict] = []
    while heap:
        _, _, u = heapq.heappop(heap)
        ordered_steps.append(nodes[u])
        for v in depend_adj.get(u, []):
            in_degree[v] -= 1
            if in_degree[v] == 0:
                v_node = nodes[v]
                heapq.heappush(heap, (1 if v_node["is_root"] else 0, v_node["title"].lower(), v))

    has_cycle = len(ordered_steps) < len(nodes)
    if has_cycle:
        ordered_keys = {n["key"] for n in ordered_steps}
        remaining_keys = set(nodes.keys()) - ordered_keys
        warnings.append(_find_cycle_warning(remaining_keys, prereq_adj, nodes))

    return {
        "root": nodes[root_key],
        "steps": ordered_steps,
        "warnings": warnings,
        "has_cycle": has_cycle,
    }
