package com.todo.demo.repository;

import com.todo.demo.model.todo;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TodoRepository extends JpaRepository<todo, Long> {
}