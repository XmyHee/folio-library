import type { Dispatch, SetStateAction } from "react";
import type { DerivedBook, DuplicateGroup } from "../lib/types";
import { coverUrlFor } from "../lib/document-cover";
import { isReviewed, needsReview, reviewReasons } from "../lib/review";
import { formatBytes } from "../lib/files";
import { Cover } from "./BookCover";
import { ROLE_LABEL } from "./book-presentation";
interface Props {
  tab:"audit" | "rename" | "dedupe"; filtered:DerivedBook[]; pageBooks:DerivedBook[];
  renameBooks:DerivedBook[]; allBooks:DerivedBook[]; visibleGroups:DuplicateGroup[]; pageGroups:DuplicateGroup[];
  checkedIds:Set<string>; toggleBook:(id:string)=>void; openDetails:(book:DerivedBook)=>void;
  setKeepOverrides:Dispatch<SetStateAction<Record<string,string>>>;
}

export function LibraryResults({tab, filtered, pageBooks, renameBooks, allBooks, visibleGroups, pageGroups, checkedIds, toggleBook, openDetails, setKeepOverrides}:Props) {
  return (
    <>
{tab === "audit" ? (
            <>
              <div className="mobile-cards">
                {filtered.length === 0 ? (
                  <p className="empty">没有符合筛选的图书。</p>
                ) : (
                  pageBooks.map((book) => (
                    <div key={book.id} className="selectable-row"><input type="checkbox" aria-label={`选择 ${book.originalName}`} checked={checkedIds.has(book.id)} onChange={() => toggleBook(book.id)} /><button
                      type="button"
                      className="card-row"
                      onClick={() => openDetails(book)}
                    >
                      <Cover src={coverUrlFor(book)} kind={book.kind} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {book.resolvedTitle || book.rawTitle || "【缺失书名】"}
                          {book.metaSource ? (
                            <span className="badge" style={{ marginLeft: 6, fontSize: "0.7rem" }}>
                              {book.metaSource === "manual" ? "人工校正" : book.metaSource === "markdown" ? "Markdown" : book.metaSource === "openlibrary"
                                ? "在线书目"
                                : book.metaSource === "epub"
                                  ? "EPUB"
                                  : book.metaSource === "pdf"
                                    ? "PDF"
                                    : book.metaSource === "filename"
                                      ? "文件名"
                                      : ""}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          {book.displayAuthor}
                        </div>
                        <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          <span className={`badge ${ROLE_LABEL[book.role].cls}`}>
                            {ROLE_LABEL[book.role].text}
                          </span>
                          {book.paperReasons?.length ? <span className="badge badge-accent">论文候选</span> : null} {book.coverPreference === "title" ? <span className="badge">生成封面</span> : null}
                          {book.nameChanged ? <span className="badge badge-warn">待命名</span> : <span className="badge">名称未变</span>} {book.groupId ? <span className="badge badge-accent">重复组</span> : null}
                          {reviewReasons(book).length ? <span className="badge badge-warn">信息：{reviewReasons(book).join("、")}</span> : <span className="badge">无已知异常</span>} {needsReview(book) ? <span className="badge badge-warn">待审核</span> : isReviewed(book) ? <span className="badge badge-accent">已人工审核</span> : null}
                          {book.hasZlibTag ? <span className="badge badge-warn">zlib</span> : null}
                          {book.status === "error" ? (
                            <span className="badge badge-drop">失败</span>
                          ) : null}
                        </div>
                      </div>
                    </button></div>
                  ))
                )}
              </div>
              <div className="desktop-table table-wrap">
                {filtered.length === 0 ? (
                  <p className="empty">没有符合筛选的图书。</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>选择</th><th>书目</th>
                        <th>原始文件名</th>
                        <th>体积</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageBooks.map((book) => (
                        <tr key={book.id}>
                          <td><input type="checkbox" aria-label={`选择 ${book.originalName}`} checked={checkedIds.has(book.id)} onChange={() => toggleBook(book.id)} /></td><td>
                            <button
                              type="button"
                              className="book-cell"
                              onClick={() => openDetails(book)}
                            >
                              <Cover src={coverUrlFor(book)} kind={book.kind} />
                              <span>
                                <span>{book.rawTitle || "【缺失书名】"}</span>
                                <span className="meta">{book.displayAuthor}</span>
                              </span>
                            </button>
                          </td>
                          <td
                            style={{
                              fontFamily: "ui-monospace, monospace",
                              fontSize: "0.75rem",
                              color: "var(--muted)",
                              maxWidth: "16rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {book.originalName}
                          </td>
                          <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>
                            {formatBytes(book.size)}
                          </td>
                          <td>
                            <span className={`badge ${ROLE_LABEL[book.role].cls}`}>
                              {ROLE_LABEL[book.role].text}
                            </span>{" "}
                            {book.paperReasons?.length ? <span className="badge badge-accent">论文候选</span> : null} {book.coverPreference === "title" ? <span className="badge">生成封面</span> : null}
                          {book.nameChanged ? <span className="badge badge-warn">待命名</span> : <span className="badge">名称未变</span>} {book.groupId ? <span className="badge badge-accent">重复组</span> : null}
                          {book.hasZlibTag ? <span className="badge badge-warn">zlib</span> : null}{" "}
                            {reviewReasons(book).length ? <span className="badge badge-warn">信息：{reviewReasons(book).join("、")}</span> : <span className="badge">无已知异常</span>} {needsReview(book) ? <span className="badge badge-warn">待审核</span> : isReviewed(book) ? <span className="badge badge-accent">已人工审核</span> : null}
                            {book.status === "error" ? (
                              <span className="badge badge-drop">失败</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : null}

          {tab === "rename" ? (
            <div className="list">
              {renameBooks.length === 0 ? (
                <p className="empty">没有需要重命名的文件。</p>
              ) : (
                pageBooks.map((book) => (
                  <div key={book.id} className="selectable-row"><input type="checkbox" aria-label={`选择 ${book.originalName}`} checked={checkedIds.has(book.id)} onChange={() => toggleBook(book.id)} /><button
                    type="button"
                    className="list-item"
                    onClick={() => openDetails(book)}
                  >
                    <span className="badge badge-warn">待命名</span>
                    <div className="old">原名：{book.originalName}</div>
                    <div className="new">建议：{book.proposedName}</div>
                  </button></div>
                ))
              )}
            </div>
          ) : null}

          {tab === "dedupe" ? (
            visibleGroups.length === 0 ? (
              <p className="empty">当前搜索范围内没有重复组。</p>
            ) : (
              pageGroups.map((group) => {
                const members = group.bookIds
                  .map((id) => allBooks.find((b) => b.id === id))
                  .filter(Boolean) as DerivedBook[];
                const title =
                  members.find((m) => m.rawTitle)?.rawTitle ||
                  members[0]?.cleanTitle ||
                  group.key;
                return (
                  <section key={group.id} className="group">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h3 style={{ margin: 0 }}>{title}</h3>
                      <span className={`badge ${group.kind === "hash" || group.kind === "isbn" ? "badge-warn" : group.kind === "fuzzy" ? "badge-accent" : ""}`}>
                        {group.kind === "hash"
                          ? "内容完全相同"
                          : group.kind === "isbn"
                            ? "ISBN 相同"
                            : group.kind === "fuzzy"
                              ? "书名相似"
                              : "书名作者相同"}
                      </span>
                      {group.reason ? (
                        <span style={{ fontSize: "0.75rem", color: "var(--faint)" }}>{group.reason}</span>
                      ) : null}
                      <span style={{ fontSize: "0.75rem", color: "var(--faint)" }}>
                        {members.length} 个版本
                      </span>
                    </div>
                    {members.map((book) => {
                      const kept = book.id === group.keepId;
                      return (
                        <div key={book.id} className="member"><input type="checkbox" aria-label={`选择 ${book.originalName}`} checked={checkedIds.has(book.id)} onChange={() => toggleBook(book.id)} />
                          <Cover src={coverUrlFor(book)} kind={book.kind} />
                          <div className="info">
                            <button
                              type="button"
                              className="name"
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "inherit",
                                font: "inherit",
                                padding: 0,
                                cursor: "pointer",
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                              }}
                              onClick={() => openDetails(book)}
                            >
                              {book.originalName}
                            </button>
                            <div className="sub">
                              {book.displayAuthor} · {formatBytes(book.size)}
                              {book.hasZlibTag ? " · z-library" : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ height: "2.25rem", padding: "0 0.5rem" }}
                            onClick={() =>
                              setKeepOverrides((prev) => ({ ...prev, [group.id]: book.id }))
                            }
                          >
                            <span className={`badge ${kept ? "badge-keep" : "badge-drop"}`}>
                              {kept ? "保留" : "隔离"}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </section>
                );
              })
            )
          ) : null}
    </>
  );
}
