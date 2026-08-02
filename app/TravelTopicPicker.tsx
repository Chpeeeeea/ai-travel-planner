"use client";

import { useMemo, useState } from "react";
import { MAX_SELECTED_TRAVEL_TOPICS, TRAVEL_TOPIC_GROUPS, TRAVEL_TOPICS } from "../platform/runtime/travel-topics.mjs";
import styles from "./travel-topic-picker.module.css";

type Props = {
  selected: string[];
  onToggle: (label: string) => void;
};

export default function TravelTopicPicker({ selected, onToggle }: Props) {
  const [activeGroup, setActiveGroup] = useState("humanities");
  const visibleTopics = useMemo(
    () => activeGroup === "all" ? TRAVEL_TOPICS : TRAVEL_TOPICS.filter((topic) => topic.group === activeGroup),
    [activeGroup],
  );
  const activeDescription = TRAVEL_TOPIC_GROUPS.find((group) => group.id === activeGroup)?.description;

  return <div className={styles.picker}>
    <div className={styles.groups} role="tablist" aria-label="旅行主题分类">
      <button type="button" role="tab" aria-selected={activeGroup === "all"} className={activeGroup === "all" ? styles.activeGroup : ""} onClick={() => setActiveGroup("all")}>全部 <small>{TRAVEL_TOPICS.length}</small></button>
      {TRAVEL_TOPIC_GROUPS.map((group) => <button type="button" role="tab" key={group.id} aria-selected={activeGroup === group.id} className={activeGroup === group.id ? styles.activeGroup : ""} onClick={() => setActiveGroup(group.id)}>{group.label}</button>)}
    </div>
    <p className={styles.description}>{activeDescription ?? `从 ${TRAVEL_TOPICS.length} 个主题中选择；每项都会成为独立研究线。`}</p>
    <div className={styles.selectedTopics} aria-label="已选旅行主题">
      {selected.map((label) => <button type="button" key={label} onClick={() => onToggle(label)} title={`移除${label}`}>{label}<span>×</span></button>)}
    </div>
    <div className={styles.topics} role="group" aria-label="可选旅行主题">
      {visibleTopics.map((topic) => {
        const isSelected = selected.includes(topic.label);
        const isDisabled = !isSelected && selected.length >= MAX_SELECTED_TRAVEL_TOPICS;
        return <button
          type="button"
          key={topic.id}
          title={topic.scope}
          className={isSelected ? styles.selected : ""}
          onClick={() => onToggle(topic.label)}
          aria-pressed={isSelected}
          disabled={isDisabled}
        >{topic.label}</button>;
      })}
    </div>
    <p className={styles.selectionNote}>已选 {selected.length}/{MAX_SELECTED_TRAVEL_TOPICS} · 限制研究线数量是为了控制检索耗时；具体菜品和必去地点可继续在下方填写。</p>
  </div>;
}
