package com.todo.demo.controller;

import com.todo.demo.model.todo;
import com.todo.demo.repository.TodoRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/todos")
@CrossOrigin(origins = "http://localhost:5173")
public class TodoController {

    private final TodoRepository todoRepository;

    public TodoController(TodoRepository todoRepository) {
        this.todoRepository = todoRepository;
    }

    @GetMapping
    public List<todo> getAllTodos() {
        return todoRepository.findAll();
    }

    @PostMapping
    public todo createTodo(@RequestBody todo todo) {
        return todoRepository.save(todo);
    }

    @PutMapping("/{id}")
    public todo updateTodo(@PathVariable Long id, @RequestBody todo updatedTodo) {
        todo todo = todoRepository.findById(id).orElseThrow();

        todo.setTitle(updatedTodo.getTitle());
        todo.setCompleted(updatedTodo.isCompleted());

        return todoRepository.save(todo);
    }

    @DeleteMapping("/{id}")
    public void deleteTodo(@PathVariable Long id) {
        todoRepository.deleteById(id);
    }
}